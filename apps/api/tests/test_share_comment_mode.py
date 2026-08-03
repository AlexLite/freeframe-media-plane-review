import pytest
from pydantic import ValidationError

from apps.api.schemas.share import ShareLinkAppearance, ShareLinkCreate, ShareLinkUpdate


def test_detailed_comments_are_the_default_for_new_and_existing_links():
    assert ShareLinkAppearance().comment_mode == "detailed"
    assert ShareLinkCreate().appearance.comment_mode == "detailed"


def test_simple_comment_mode_is_accepted_in_create_and_update_payloads():
    create = ShareLinkCreate(appearance={"comment_mode": "simple"})
    update = ShareLinkUpdate(appearance={"comment_mode": "simple"})

    assert create.appearance.comment_mode == "simple"
    assert update.appearance is not None
    assert update.appearance.comment_mode == "simple"


def test_unknown_comment_mode_is_rejected():
    with pytest.raises(ValidationError):
        ShareLinkAppearance(comment_mode="unknown")
