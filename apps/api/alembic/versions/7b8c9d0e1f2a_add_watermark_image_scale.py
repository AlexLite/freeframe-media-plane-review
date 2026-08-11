"""add watermark image scale

Revision ID: 7b8c9d0e1f2a
Revises: 6ab7c8d9e0f1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b8c9d0e1f2a"
down_revision: Union[str, Sequence[str], None] = "6ab7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "watermark_settings",
        sa.Column("image_scale", sa.String(length=20), nullable=False, server_default="fit"),
    )


def downgrade() -> None:
    op.drop_column("watermark_settings", "image_scale")
