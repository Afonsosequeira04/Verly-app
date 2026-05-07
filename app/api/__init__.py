"""
app/api/__init__.py — Blueprint da API REST para o React Native

Todos os endpoints aqui retornam JSON.
Autenticação via JWT (flask-jwt-extended).

Regista no __init__.py principal:
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/v1')
"""

from flask import Blueprint

api_bp = Blueprint('api', __name__)

from app.api import auth, dashboard, faturas, notificacoes, chat, subscricoes, metas  # noqa
