"""
migration_gmail_fix.py — Corrige a coluna gmail_message_id na tabela faturas

Correr uma vez:
  python migration_gmail_fix.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
import sqlalchemy as sa

app = create_app()

with app.app_context():
    conn = db.engine.connect()

    # 1. Verificar se gmail_message_id já existe
    try:
        result = conn.execute(sa.text("PRAGMA table_info(faturas)"))
        columns = [row[1] for row in result]
        
        if 'gmail_message_id' not in columns:
            # Adicionar sem UNIQUE (SQLite não suporta ADD COLUMN UNIQUE)
            conn.execute(sa.text(
                'ALTER TABLE faturas ADD COLUMN gmail_message_id VARCHAR(100)'
            ))
            conn.commit()
            print("✅ Coluna gmail_message_id adicionada.")
            
            # Criar índice UNIQUE separado
            conn.execute(sa.text(
                'CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_message_id ON faturas(gmail_message_id)'
            ))
            conn.commit()
            print("✅ Índice UNIQUE criado.")
        else:
            print("⚠️  gmail_message_id já existe, a criar índice se não existir...")
            try:
                conn.execute(sa.text(
                    'CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_message_id ON faturas(gmail_message_id)'
                ))
                conn.commit()
                print("✅ Índice UNIQUE criado.")
            except Exception as e:
                print(f"⚠️  Índice já existe: {e}")

    except Exception as e:
        print(f"❌ Erro: {e}")

    # 2. Garantir coluna fonte
    try:
        if 'fonte' not in columns:
            conn.execute(sa.text(
                "ALTER TABLE faturas ADD COLUMN fonte VARCHAR(20) DEFAULT 'upload'"
            ))
            conn.commit()
            print("✅ Coluna fonte adicionada.")
        else:
            print("⚠️  Coluna fonte já existe.")
    except Exception as e:
        print(f"⚠️  fonte: {e}")

    # 3. Garantir tabela gmail_connections
    try:
        conn.execute(sa.text('''
            CREATE TABLE IF NOT EXISTS gmail_connections (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id),
                gmail_email          VARCHAR(200),
                credentials_json     TEXT NOT NULL,
                ativa                BOOLEAN DEFAULT 1,
                ultima_sync          DATETIME,
                faturas_importadas   INTEGER DEFAULT 0,
                criada_em            DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        '''))
        conn.commit()
        print("✅ Tabela gmail_connections verificada.")
    except Exception as e:
        print(f"⚠️  gmail_connections: {e}")

    conn.close()
    print("\n✅ Migration concluída. Reinicia o servidor.")