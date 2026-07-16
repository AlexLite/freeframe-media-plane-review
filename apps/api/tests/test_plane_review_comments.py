from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response
from pydantic import ValidationError

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.user import UserStatus
from apps.api.routers.plane_review_comments import (
    create_plane_review_comment,
    delete_plane_review_comment,
    resolve_plane_review_comment,
    router,
)
from apps.api.schemas.comment import AnnotationData
from apps.api.schemas.plane_review_comment import PlaneReviewCommentCreate


def _principal(*scopes: str) -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset(scopes),
    )


def _db_returning(value):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = value
    return db


def test_comment_schema_normalizes_body_and_validates_timecode_range():
    body = PlaneReviewCommentCreate(body="  Fix this cut  ", timecode_start=4.5)
    assert body.body == "Fix this cut"

    with pytest.raises(ValidationError):
        PlaneReviewCommentCreate(body="   ")
    with pytest.raises(ValidationError):
        PlaneReviewCommentCreate(body="Range", timecode_start=5, timecode_end=4)


def test_create_comment_is_public_and_context_version_bound():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(id=uuid4(), asset_id=asset.id)
    db = _db_returning(version)
    response = Response()

    with patch(
        "apps.api.routers.plane_review_comments._build_comment_response",
        return_value={"id": "comment"},
    ):
        result = create_plane_review_comment(
            version_id=version.id,
            body=PlaneReviewCommentCreate(body="  Tighten the transition  ", timecode_start=12.25),
            response=response,
            db=db,
            asset=asset,
            principal=principal,
        )

    assert result == {"id": "comment"}
    comment = db.add.call_args.args[0]
    assert comment.asset_id == asset.id
    assert comment.version_id == version.id
    assert comment.author_id == principal.user.id
    assert comment.body == "Tighten the transition"
    assert comment.timecode_start == 12.25
    assert comment.visibility == "public"
    assert response.headers["cache-control"] == "no-store, private"
    db.commit.assert_called_once()


def test_create_comment_rejects_version_from_another_asset():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4())
    db = _db_returning(None)

    with pytest.raises(HTTPException) as exc:
        create_plane_review_comment(
            version_id=uuid4(),
            body=PlaneReviewCommentCreate(body="Comment"),
            response=Response(),
            db=db,
            asset=asset,
            principal=principal,
        )

    assert exc.value.status_code == 404
    db.add.assert_not_called()


def test_create_comment_persists_drawing_annotation():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(id=uuid4(), asset_id=asset.id)
    db = _db_returning(version)
    response = Response()
    drawing_data = {"objects": [{"type": "Path"}], "_canvasWidth": 1280}

    with patch(
        "apps.api.routers.plane_review_comments._build_comment_response",
        return_value={"id": "comment"},
    ):
        create_plane_review_comment(
            version_id=version.id,
            body=PlaneReviewCommentCreate(
                body="Mark this frame",
                timecode_start=3.5,
                annotation=AnnotationData(drawing_data=drawing_data),
            ),
            response=response,
            db=db,
            asset=asset,
            principal=principal,
        )

    comment, annotation = [call.args[0] for call in db.add.call_args_list]
    assert annotation.comment_id == comment.id
    assert annotation.drawing_data == drawing_data
    db.flush.assert_called_once()


def test_resolve_toggles_only_public_comment_on_linked_asset():
    principal = _principal("review:comment")
    asset = SimpleNamespace(id=uuid4())
    comment = SimpleNamespace(
        id=uuid4(),
        asset_id=asset.id,
        author_id=principal.user.id,
        resolved=False,
        updated_at=None,
    )
    db = _db_returning(comment)

    with patch(
        "apps.api.routers.plane_review_comments._build_comment_response",
        return_value={"resolved": True},
    ):
        result = resolve_plane_review_comment(
            comment_id=comment.id,
            response=Response(),
            db=db,
            asset=asset,
            principal=principal,
        )

    assert result == {"resolved": True}
    assert comment.resolved is True
    assert comment.updated_at is not None
    db.commit.assert_called_once()


def test_delete_requires_comment_owner_or_manage_scope():
    asset = SimpleNamespace(id=uuid4())
    comment = SimpleNamespace(
        id=uuid4(),
        asset_id=asset.id,
        author_id=uuid4(),
        deleted_at=None,
    )

    db = _db_returning(comment)
    with pytest.raises(HTTPException) as exc:
        delete_plane_review_comment(
            comment_id=comment.id,
            response=Response(),
            db=db,
            asset=asset,
            principal=_principal("review:comment"),
        )
    assert exc.value.status_code == 403
    assert comment.deleted_at is None
    db.commit.assert_not_called()

    manager = _principal("review:comment", "review:manage")
    db = _db_returning(comment)
    delete_plane_review_comment(
        comment_id=comment.id,
        response=Response(),
        db=db,
        asset=asset,
        principal=manager,
    )
    assert comment.deleted_at is not None
    db.commit.assert_called_once()


def test_plane_review_comment_routes_are_registered():
    routes = {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }
    assert (
        "/integrations/plane/assets/{asset_id}/versions/{version_id}/comments",
        "GET",
    ) in routes
    assert (
        "/integrations/plane/assets/{asset_id}/versions/{version_id}/comments",
        "POST",
    ) in routes
    assert (
        "/integrations/plane/assets/{asset_id}/comments/{comment_id}/resolve",
        "POST",
    ) in routes
    assert (
        "/integrations/plane/assets/{asset_id}/comments/{comment_id}",
        "DELETE",
    ) in routes
