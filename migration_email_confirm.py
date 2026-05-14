"""
migration_email_confirm.py — Adiciona campos de confirmação de email ao modelo User

Corre UMA VEZ:
  python migration_email_confirm.py
"""

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    migrations = [
        ('users', 'email_confirmado',      'BOOLEAN DEFAULT 0'),
        ('users', 'email_confirm_token',   'VARCHAR(100)'),
        ('users', 'email_confirm_expiry',  'DATETIME'),
    ]

    for table, col, col_type in migrations:
        try:
            db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {col_type}'))
            db.session.commit()
            print(f'✅ Adicionado: {table}.{col}')
        except Exception as e:
            db.session.rollback()
            if 'duplicate column' in str(e).lower() or 'already exists' in str(e).lower():
                print(f'⚠️  Já existe: {table}.{col}')
            else:
                print(f'❌ Erro em {table}.{col}: {e}')

    # Marcar utilizadores existentes como confirmados (não queremos bloquear quem já tem conta)
    try:
        db.session.execute(text(
            "UPDATE users SET email_confirmado = 1 WHERE email_confirmado IS NULL OR email_confirmado = 0"
        ))
        db.session.commit()
        print('✅ Utilizadores existentes marcados como confirmados.')
    except Exception as e:
        db.session.rollback()
        print(f'❌ Erro ao atualizar utilizadores: {e}')

    print('\n✅ Migração concluída!')