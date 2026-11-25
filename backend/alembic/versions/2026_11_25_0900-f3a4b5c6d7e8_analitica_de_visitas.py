"""analítica de visitas: páginas vistas, anónimas y sin cookies

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-25 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'page_views',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('section', sa.String(30), nullable=False),
        sa.Column('path', sa.String(200), nullable=False),
        sa.Column('establishment_id', sa.Integer(),
                  sa.ForeignKey('establishments.id', ondelete='SET NULL',
                                name=op.f('fk_page_views_establishment_id_establishments'))),
        sa.Column('visitor_hash', sa.String(32), nullable=False),
        sa.Column('device', sa.String(10), nullable=False),
        sa.Column('referrer', sa.String(100)),
        sa.Column('is_logged_in', sa.Boolean(), nullable=False, server_default='false'),
        sa.CheckConstraint("device IN ('mobile', 'tablet', 'desktop')", name=op.f('ck_page_views_device_valid')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_page_views')),
    )
    op.create_index(op.f('ix_page_views_created_at'), 'page_views', ['created_at'])
    op.create_index(op.f('ix_page_views_establishment_id'), 'page_views', ['establishment_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_page_views_establishment_id'), table_name='page_views')
    op.drop_index(op.f('ix_page_views_created_at'), table_name='page_views')
    op.drop_table('page_views')
