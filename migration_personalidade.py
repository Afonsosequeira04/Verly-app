"""
migration_personalidade.py
Adiciona a coluna `personalidade` à tabela `users`.

Executa UMA VEZ com:
    python migration_personalidade.py

Ou integra no teu processo de migração (Flask-Migrate, etc.).
"""
import sqlite3
import os

DB_PATH = 'shopping_police.db'

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Verificar se a coluna já existe
    cur.execute("PRAGMA table_info(users)")
    cols = [row[1] for row in cur.fetchall()]

    if 'personalidade' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN personalidade VARCHAR(20) DEFAULT 'calm'")
        conn.commit()
        print("✓ Coluna 'personalidade' adicionada à tabela users.")
    else:
        print("ℹ Coluna 'personalidade' já existe. Nada a fazer.")

    conn.close()


if __name__ == '__main__':
    run()
