"""
migration_v2.py — Corre este script UMA VEZ para adicionar as novas colunas ao DB.

Uso:
    python migration_v2.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from sqlalchemy import text, inspect

app = create_app()

with app.app_context():
    inspector = inspect(db.engine)

    def col_exists(table, col):
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
            return col in cols
        except Exception:
            return False

    def table_exists(table):
        return inspector.has_table(table)

    migrations = [
        # users
        ('users', 'google_id',  'VARCHAR(128)'),
        ('users', 'avatar_url', 'VARCHAR(512)'),
        # metas
        ('metas', 'nome',       'VARCHAR(100)'),
    ]

    for table, col, col_type in migrations:
        if not col_exists(table, col):
            try:
                db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {col_type}'))
                db.session.commit()
                print(f'✅ Adicionado: {table}.{col}')
            except Exception as e:
                db.session.rollback()
                print(f'⚠️  Falhou {table}.{col}: {e}')
        else:
            print(f'   Já existe: {table}.{col}')

    # Criar tabelas novas (Playlist, Amizade, etc.)
    db.create_all()
    print('✅ Tabelas criadas/verificadas (playlist, amizades, etc.)')

print('\nMigração concluída.')