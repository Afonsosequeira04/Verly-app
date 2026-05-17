"""
migrate_prod.py — Cria todas as tabelas no PostgreSQL de produção.
Corre uma vez após o deploy: python migrate_prod.py
"""
import os
import sys

# Forçar ambiente de produção
os.environ['FLASK_ENV'] = 'production'

from app import create_app, db
from app.models import (
    User, Fatura, Conversa, Meta, ContaBancaria,
    Subscricao, Playlist, playlist_fatura, playlist_membro
)

try:
    from app.models import GmailConnection
except ImportError:
    GmailConnection = None

app = create_app()

with app.app_context():
    print("A criar tabelas no PostgreSQL...")
    db.create_all()
    print("✅ Todas as tabelas criadas com sucesso!")
    
    # Listar tabelas criadas
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    print(f"Tabelas: {', '.join(tables)}")