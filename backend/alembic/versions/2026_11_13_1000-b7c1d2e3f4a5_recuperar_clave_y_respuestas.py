"""recuperar contraseña y respuestas del propietario a reseñas

Revision ID: b7c1d2e3f4a5
Revises: aa5b40e96a66
Create Date: 2026-11-13 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'aa5b40e96a66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('reset_code_hash', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('reset_code_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('reset_attempts', sa.Integer(), server_default='0', nullable=False))
    op.add_column('reviews', sa.Column('owner_reply', sa.Text(), nullable=True))
    op.add_column('reviews', sa.Column('owner_reply_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('reviews', 'owner_reply_at')
    op.drop_column('reviews', 'owner_reply')
    op.drop_column('users', 'reset_attempts')
    op.drop_column('users', 'reset_code_expires_at')
    op.drop_column('users', 'reset_code_hash')
