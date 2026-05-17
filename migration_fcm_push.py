"""
migration_fcm_push.py — Adiciona colunas de push notifications ao modelo User

Executar:
    python migration_fcm_push.py
"""

import os
import sys
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s — %(message)s')
logger = logging.getLogger('migration_fcm')


def main():
    from app import create_app, db
    from sqlalchemy import text

    app = create_app()

    with app.app_context():
        with db.engine.connect() as conn:
            # Verificar e adicionar colunas
            colunas = [
                ('fcm_token',         'VARCHAR(512)'),
                ('fcm_token_updated', 'TIMESTAMP'),
                ('push_ativas',       'BOOLEAN DEFAULT TRUE'),
            ]

            for coluna, tipo in colunas:
                try:
                    conn.execute(text(f'ALTER TABLE users ADD COLUMN {coluna} {tipo}'))
                    conn.commit()
                    logger.info(f'✅ Coluna users.{coluna} adicionada.')
                except Exception as e:
                    if 'duplicate column' in str(e).lower() or 'already exists' in str(e).lower():
                        logger.info(f'ℹ️ Coluna users.{coluna} já existe.')
                    else:
                        logger.error(f'❌ Erro ao adicionar {coluna}: {e}')

        logger.info('Migration FCM concluída.')


if __name__ == '__main__':
    main()