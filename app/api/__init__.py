"""
app/api/__init__.py
Regista o blueprint da API mobile e importa todas as rotas.
"""
from flask import Blueprint

api_bp = Blueprint('api', __name__)  # url_prefix definido em app/__init__.py ao registar

from app.api import auth          # noqa: F401, E402
from app.api import chat          # noqa: F401, E402
from app.api import dashboard     # noqa: F401, E402
from app.api import faturas       # noqa: F401, E402
from app.api import mobile_extras # noqa: F401, E402
from app.api import playlists     # noqa: F401, E402
from app.api import metas         # noqa: F401, E402
from app.api import amizades      # noqa: F401, E402
from app.api import insights          # noqa
from app.api import onboarding_mobile  # noqa
from app.api import notificacoes_mobile  # noqa
from app.api import perfil_mobile  # noqa
from app.api import gmail          # noqa
from app.api import exportar_mobile    # noqa
from app.api import push_notifications # noqa
from app.api import estatisticas  # noqa
from app.api import social         # noqa