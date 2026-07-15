from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.user import UserStatus
from apps.api.routers.plane_integration import (
    create_plane_review_comment,
    get_plane_review_asset,
    list_plane_review_comments,
)
from apps.api.schemas.comment import CommentCreate


def _principal(*scopes: str) -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), name="Plane Reviewer", status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset(scopes),
    )


def test_get_plane_review_asset_reuses_asset_response_builder():
    asset = SimpleNamespace(id=uuid4())
    db = MagicMock()
    expected = SimpleNamespace(id=asset.id)

    with patch(
        "apps.api.routers.plane_integration._build_asset_response",
        return_value=expected,
    ) as build:
        result = get_plane_review_asset(db=db, asset=asset)

    assert result is expected
    build.assert_called_once_with(asset, db)


def test_list_plane_review_comments_returns_only_public_top_level_comments():
    principal = _principal("review:read")
    asset = SimpleNamespace(id=uuid4())
    comment = SimpleNamespace(id=uuid4())
    db = MagicMock()
    query = db.query.return_value.filter.return_value
    query.order_by.return_value.all.return_value = [comment]

    with patch(
        "apps.api.routers.plane_integration._build_comment_response",
        return_value=SimpleNamespace(id=comment.id),
    ) as build:
        result = list_plane_review_comments(
            version_id=None,
            db=db,
            asset=asset,
            principal=principal,
        )

    assert [item.id for item in result] == [comment.id]
    build.assert_called_once_with(comment, db, current_user_id=principal.user.id)


def test_plane_review_comment_rejects_internal_visibility():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4())
    body = CommentCreate(body="private note", visibility="internal")

    with pytest.raises(HTTPException) as exc:
        create_plane_review_comment(
            body=body,
            db=MagicMock(),
            asset=asset,
            principal=principal,
        )

    assert exc.value.status_code == 403
    assert "internal comments" in exc.value.detail


def test_plane_review_comment_is_public_and_owned_by_shadow_user():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4(), created_by=uuid4())
    body = CommentCreate(body="Frame 120 needs a trim", timecode_start=5.0)
    db = MagicMock()

    with (
        patch("apps.api.routers.plane_integration._create_mentions"),
        patch(
            "apps.api.routers.plane_integration._build_comment_response",
            return_value=SimpleNamespace(body=body.body),
        ),
    ):
        result = create_plane_review_comment(
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        )

    comment = db.add.call_args_list[0].args[0]
    assert comment.author_id == principal.user.id
    assert comment.visibility == "public"
    assert comment.asset_id == asset.id
    assert result.body == body.body
    db.commit.assert_called_once()
