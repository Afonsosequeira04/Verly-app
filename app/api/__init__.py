"""
app/api/__init__.py — Blueprint da API REST para o React Native

Todos os endpoints aqui retornam JSON.
Autenticação via JWT (flask-jwt-extended).

Registar no __init__.py principal:
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/v1')
"""

from flask import Blueprint
from app import csrf

api_bp = Blueprint('api', __name__)

# Excluir as rotas da API do CSRF protection (usam JWT em vez de CSRF)
csrf.exempt(api_bp)

from app.api import auth, dashboard, faturas, chat, mobile_extras  # noqa