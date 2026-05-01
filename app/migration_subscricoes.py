"""
migration_subscricoes.py
Cria a tabela 'subscricoes' na BD existente sem apagar dados.
Corre uma única vez: python migration_subscricoes.py
"""
from app import create_app, db
from app.models import Subscricao

app = create_app()

with app.app_context():
    db.create_all()
    print("✅ Tabela 'subscricoes' criada (ou já existia). Tudo pronto.")