"""asistente IA: consultas, respuestas, fuentes y calificaciones

Tablas del módulo de asistente con IA. Las usa Spring Boot (entidades JPA en gateway/.../asistente), pero el
esquema lo administra Alembic para que exista una sola fuente de verdad de la base de datos.

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-11-20 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ESTADOS = "('PENDIENTE', 'RESPONDIDA', 'SIN_RESULTADOS', 'ERROR')"


def upgrade() -> None:
    # Cada pregunta que un usuario le hace al asistente
    op.create_table(
        'consultas_ia',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE',
                                                             name='fk_consultas_ia_usuario_id_users'), nullable=False),
        sa.Column('pregunta', sa.String(500), nullable=False),
        sa.Column('estado', sa.String(20), nullable=False, server_default='PENDIENTE'),
        # Umbral con el que se respondió (si cambia la configuración, el historial conserva el que se usó)
        sa.Column('umbral', sa.Numeric(4, 3), nullable=False),
        sa.Column('mejor_similitud', sa.Numeric(5, 4)),
        sa.Column('detalle_error', sa.String(300)),
        sa.Column('duracion_ms', sa.Integer()),
        sa.Column('creada_en', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('respondida_en', sa.DateTime(timezone=True)),
        sa.CheckConstraint(f"estado IN {ESTADOS}", name='estado_valido'),
        sa.CheckConstraint("char_length(btrim(pregunta)) >= 3", name='pregunta_no_vacia'),
        sa.CheckConstraint("umbral > 0 AND umbral < 1", name='umbral_rango'),
        sa.CheckConstraint("mejor_similitud IS NULL OR (mejor_similitud >= -1 AND mejor_similitud <= 1)",
                           name='similitud_rango'),
    )
    op.create_index('ix_consultas_ia_usuario_creada', 'consultas_ia', ['usuario_id', sa.text('creada_en DESC')])
    op.create_index('ix_consultas_ia_estado', 'consultas_ia', ['estado'])
    op.create_index('ix_consultas_ia_creada_en', 'consultas_ia', ['creada_en'])

    # La respuesta generada (una por consulta; las consultas sin resultados también tienen su mensaje)
    op.create_table(
        'respuestas_ia',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('consulta_id', sa.Integer(), sa.ForeignKey('consultas_ia.id', ondelete='CASCADE',
                                                              name='fk_respuestas_ia_consulta_id_consultas_ia'),
                  nullable=False),
        sa.Column('respuesta', sa.Text(), nullable=False),
        sa.Column('pasos', postgresql.ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('modelo', sa.String(60)),
        sa.Column('creada_en', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('consulta_id', name='uq_respuestas_ia_consulta_id'),
    )

    # Negocios usados como fuente de cada respuesta, con su similitud
    op.create_table(
        'fuentes_respuesta',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('respuesta_id', sa.Integer(), sa.ForeignKey('respuestas_ia.id', ondelete='CASCADE',
                                                               name='fk_fuentes_respuesta_respuesta_id_respuestas_ia'),
                  nullable=False),
        # Si más adelante se borra el negocio, el historial se conserva con el nombre que tenía
        sa.Column('establecimiento_id', sa.Integer(), sa.ForeignKey('establishments.id', ondelete='SET NULL',
                  name='fk_fuentes_respuesta_establecimiento_id_establishments')),
        sa.Column('nombre_establecimiento', sa.String(200), nullable=False),
        sa.Column('similitud', sa.Numeric(5, 4), nullable=False),
        sa.Column('posicion', sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("similitud >= -1 AND similitud <= 1", name='similitud_rango'),
        sa.CheckConstraint("posicion BETWEEN 1 AND 10", name='posicion_rango'),
        sa.UniqueConstraint('respuesta_id', 'establecimiento_id', name='uq_fuentes_respuesta_respuesta_establecimiento'),
    )
    op.create_index('ix_fuentes_respuesta_respuesta_id', 'fuentes_respuesta', ['respuesta_id'])
    op.create_index('ix_fuentes_respuesta_establecimiento_id', 'fuentes_respuesta', ['establecimiento_id'])

    # Calificación de 1 a 5 que el usuario le da a una respuesta (una por respuesta; se puede cambiar)
    op.create_table(
        'calificaciones',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('respuesta_id', sa.Integer(), sa.ForeignKey('respuestas_ia.id', ondelete='CASCADE',
                                                               name='fk_calificaciones_respuesta_id_respuestas_ia'),
                  nullable=False),
        sa.Column('puntuacion', sa.SmallInteger(), nullable=False),
        sa.Column('comentario', sa.String(500)),
        sa.Column('creada_en', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('actualizada_en', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("puntuacion BETWEEN 1 AND 5", name='puntuacion_rango'),
        sa.UniqueConstraint('respuesta_id', name='uq_calificaciones_respuesta_id'),
    )


def downgrade() -> None:
    op.drop_table('calificaciones')
    op.drop_index('ix_fuentes_respuesta_establecimiento_id', table_name='fuentes_respuesta')
    op.drop_index('ix_fuentes_respuesta_respuesta_id', table_name='fuentes_respuesta')
    op.drop_table('fuentes_respuesta')
    op.drop_table('respuestas_ia')
    op.drop_index('ix_consultas_ia_creada_en', table_name='consultas_ia')
    op.drop_index('ix_consultas_ia_estado', table_name='consultas_ia')
    op.drop_index('ix_consultas_ia_usuario_creada', table_name='consultas_ia')
    op.drop_table('consultas_ia')
