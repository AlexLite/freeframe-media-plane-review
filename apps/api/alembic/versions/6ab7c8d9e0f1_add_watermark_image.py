"""add watermark image support

Revision ID: 6ab7c8d9e0f1
Revises: 54b1ad156f8f
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6ab7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "54b1ad156f8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE watermarkcontent ADD VALUE IF NOT EXISTS 'image'")
    op.add_column("watermark_settings", sa.Column("image_s3_key", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("watermark_settings", "image_s3_key")
    # PostgreSQL enum values cannot be safely removed while rows may reference them.
