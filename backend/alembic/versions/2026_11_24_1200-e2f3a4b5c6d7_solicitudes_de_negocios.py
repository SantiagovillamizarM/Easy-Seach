"""solicitudes de negocios: registrar negocios nuevos y verificar al solicitante

La tabla ownership_claims ahora guarda dos tipos de solicitud:
- claim: alguien pide administrar un negocio que ya está en la app (como antes).
- register: alguien pide registrar un negocio nuevo; sus datos van en proposed_data y el negocio se crea al aprobarse.

También guarda si quien pide es dueño o encargado, su cargo y cuándo autorizó el uso de sus datos (Ley 1581).

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-11-24 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ownership_claims', sa.Column('kind', sa.String(20), nullable=False, server_default='claim'))
    op.add_column('ownership_claims', sa.Column('applicant_role', sa.String(20)))
    op.add_column('ownership_claims', sa.Column('applicant_position', sa.String(100)))
    op.add_column('ownership_claims', sa.Column('proposed_data', postgresql.JSONB()))
    op.add_column('ownership_claims', sa.Column('consent_at', sa.DateTime(timezone=True)))
    op.alter_column('ownership_claims', 'establishment_id', existing_type=sa.Integer(), nullable=True)
    op.create_check_constraint(op.f('ck_ownership_claims_kind_valid'), 'ownership_claims', "kind IN ('claim', 'register')")
    op.create_check_constraint(op.f('ck_ownership_claims_applicant_role_valid'), 'ownership_claims',
                               "applicant_role IS NULL OR applicant_role IN ('dueno', 'encargado')")
    op.create_check_constraint(op.f('ck_ownership_claims_claim_has_establishment'), 'ownership_claims',
                               "kind = 'register' OR establishment_id IS NOT NULL")
    op.create_check_constraint(op.f('ck_ownership_claims_register_has_data'), 'ownership_claims',
                               "kind = 'claim' OR proposed_data IS NOT NULL")


def downgrade() -> None:
    op.execute("DELETE FROM ownership_claims WHERE establishment_id IS NULL")
    for name in ('register_has_data', 'claim_has_establishment', 'applicant_role_valid', 'kind_valid'):
        op.drop_constraint(op.f(f'ck_ownership_claims_{name}'), 'ownership_claims', type_='check')
    op.alter_column('ownership_claims', 'establishment_id', existing_type=sa.Integer(), nullable=False)
    for column in ('consent_at', 'proposed_data', 'applicant_position', 'applicant_role', 'kind'):
        op.drop_column('ownership_claims', column)
