"""
app/api/__init__.py
Regista o blueprint da API mobile e importa todas as rotas.
"""
from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Importa as rotas — a ordem não importa
from app.api import auth        # noqa: F401, E402
from app.api import chat        # noqa: F401, E402  ← versão corrigida (Groq direto)
from app.api import dashboard   # noqa: F401, E402
from app.api import faturas     # noqa: F401, E402
from app.api import mobile_extras  # noqa: F401, E402
from app.api import playlists   # noqa: F401, E402  ← NOVO