"""
migration_rendimento.py — Adiciona rendimento_mensal e objetivo ao modelo User
Corre uma vez:
    python migration_rendimento.py
"""
from app import create_app, db
from sqlalchemy import text

app = create_app()
with app.app_context():
    with db.engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN rendimento_mensal FLOAT DEFAULT 0"))
            print("✅ Coluna rendimento_mensal adicionada")
        except Exception as e:
            print(f"ℹ️  rendimento_mensal já existe: {e}")
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN objetivo VARCHAR(50) DEFAULT 'controlar'"))
            print("✅ Coluna objetivo adicionada")
        except Exception as e:
            print(f"ℹ️  objetivo já existe: {e}")
        conn.commit()
    print("✅ Migração concluída")