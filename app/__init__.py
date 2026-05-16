"""
app/__init__.py — Factory da aplicação Verly

Melhorias de segurança incluídas:
  - Configuração por ambiente (dev/prod) via config.py
  - Flask-WTF CSRF protection em todas as rotas WEB (excluídas as /api/v1/*)
  - Headers de segurança HTTP
  - MAX_CONTENT_LENGTH para limitar tamanho de uploads
  - Logging estruturado
  - Firebase Admin SDK inicializado para login social
"""

import os
import logging
import firebase_admin
from firebase_admin import credentials

from flask import Flask, redirect, url_for, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect, CSRFError
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()


def _init_firebase(app):
    """Inicializa o Firebase Admin SDK (uma só vez)."""

    if firebase_admin._apps:
        return  # já inicializado (evita erro em reloads)

    # Caminho para o ficheiro de credenciais
    # ⚠️ NUNCA commitar este ficheiro no Git
    service_account_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'firebase-service-account.json'
    )

    if os.path.exists(service_account_path):
        try:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)

            app.logger.info('✅ Firebase Admin SDK inicializado.')

        except Exception as e:
            app.logger.error(f'Erro ao inicializar Firebase: {str(e)}')

    else:
        app.logger.warning(
            '⚠️ firebase-service-account.json não encontrado. '
            'Login social desativado. '
            'Obtém o ficheiro em Firebase Console → '
            'Definições do Projeto → Contas de serviço.'
        )


def create_app(config_override=None):
    app = Flask(__name__, template_folder='../templates', static_folder='../static')

    # ── Carregar configuração ─────────────────────────────────────────────────
    from config import get_config
    cfg_class = config_override or get_config()
    app.config.from_object(cfg_class)

    # ✅ Inicializar Firebase Admin SDK
    _init_firebase(app)

    # ── Logging estruturado ───────────────────────────────────────────────────
    _setup_logging(app)

    # ── Inicializar extensões ─────────────────────────────────────────────────
    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)

    # ✅ CORS — permite pedidos da app mobile e do browser
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ✅ JWT (Configurado dentro da função)
    jwt = JWTManager(app)

    app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)

    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Precisas de fazer login primeiro.'
    login_manager.login_message_category = 'warning'

    # ── Headers de segurança HTTP ─────────────────────────────────────────────
    @app.after_request
    def set_security_headers(response):
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        if not app.debug:
            response.headers['Strict-Transport-Security'] = (
                'max-age=31536000; includeSubDomains'
            )

        return response

    # ── CSRF error handler ────────────────────────────────────────────────────
    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        app.logger.warning(
            f'CSRF error: {e.description} — IP: {request.remote_addr}'
        )

        if (
            request.is_json or
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        ):
            return jsonify({
                'success': False,
                'message': 'Sessão expirada. Recarrega a página e tenta novamente.',
                'csrf_error': True
            }), 403

        from flask import flash

        flash('A tua sessão expirou. Faz login novamente.', 'error')
        return redirect(url_for('auth.login'))

    # ── Upload too large ──────────────────────────────────────────────────────
    @app.errorhandler(413)
    def handle_too_large(e):
        max_mb = (
            app.config.get('MAX_CONTENT_LENGTH', 10 * 1024 * 1024)
            // (1024 * 1024)
        )

        if (
            request.is_json or
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        ):
            return jsonify({
                'success': False,
                'message': (
                    f'Ficheiro demasiado grande. '
                    f'Máximo permitido: {max_mb} MB.'
                )
            }), 413

        from flask import flash

        flash(f'Ficheiro demasiado grande. Máximo: {max_mb} MB.', 'error')
        return redirect(url_for('faturas.faturas'))

    # ── User loader ───────────────────────────────────────────────────────────
    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # ── Blueprints web ────────────────────────────────────────────────────────
    from app.auth           import auth_bp
    from app.dashboard      import dashboard_bp
    from app.faturas        import faturas_bp
    from app.chat           import chat_bp
    from app.perfil         import perfil_bp
    from app.exportar       import exportar_bp
    from app.scoring        import scoring_bp
    from app.subscriptions  import subscriptions_bp
    from app.impulse        import impulse_bp
    from app.reports        import reports_bp
    from app.personality    import personality_bp
    from app.onboarding     import onboarding_bp
    from app.metas          import metas_bp
    from app.fatura_detalhe import fatura_detalhe_bp
    from app.estatisticas   import estatisticas_bp
    from app.historico      import historico_bp
    from app.configuracoes  import configuracoes_bp
    from app.notificacoes   import notificacoes_bp
    from app.email_routes   import email_bp

    # ✅ Blueprint da API mobile (JWT — sem CSRF)
    from app.api import api_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(faturas_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(perfil_bp)
    app.register_blueprint(exportar_bp)
    app.register_blueprint(scoring_bp)
    app.register_blueprint(subscriptions_bp)
    app.register_blueprint(impulse_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(personality_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(metas_bp)
    app.register_blueprint(fatura_detalhe_bp)
    app.register_blueprint(estatisticas_bp)
    app.register_blueprint(historico_bp)
    app.register_blueprint(configuracoes_bp)
    app.register_blueprint(notificacoes_bp)
    app.register_blueprint(email_bp)

    # ✅ API mobile registada e imediatamente isenta de CSRF
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    csrf.exempt(api_bp)

    with app.app_context():
        db.create_all()
        _migrate_db()

    app.logger.info(
        f'Verly iniciada — ambiente: '
        f'{os.getenv("FLASK_ENV", "development")}'
    )

    return app


def _setup_logging(app: Flask):
    level = logging.DEBUG if app.config.get('DEBUG') else logging.INFO

    handler = logging.StreamHandler()
    handler.setLevel(level)

    formatter = logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    handler.setFormatter(formatter)

    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(level)


def _migrate_db():
    from sqlalchemy import text, inspect

    inspector = inspect(db.engine)

    def column_exists(table, column):
        cols = [c['name'] for c in inspector.get_columns(table)]
        return column in cols

    migrations = [
        ('faturas', 'categoria', "VARCHAR(50) DEFAULT 'Outros'"),
        ('faturas', 'data_garantia', 'VARCHAR(50)'),
        ('faturas', 'data_devolucao', 'VARCHAR(50)'),
        ('faturas', 'notas', 'TEXT'),
        ('users', 'notificacoes_email', 'BOOLEAN DEFAULT 0'),
        ('users', 'email_notificacoes', 'VARCHAR(150)'),
        ('users', 'personalidade', "VARCHAR(20) DEFAULT 'calm'"),
        ('users', 'orcamento_mensal', 'FLOAT DEFAULT 0'),
        ('users', 'onboarding_completo', 'BOOLEAN DEFAULT 0'),
        ('users', 'avatar', 'VARCHAR(255)'),
        ('users', 'streak_dias', 'INTEGER DEFAULT 0'),
        ('users', 'streak_ultima_atualizacao', 'DATETIME'),
        ('users', 'lingua', "VARCHAR(10) DEFAULT 'pt'"),
    ]

    for table, column, col_type in migrations:
        if not column_exists(table, column):
            try:
                db.session.execute(
                    text(
                        f'ALTER TABLE {table} '
                        f'ADD COLUMN {column} {col_type}'
                    )
                )

                db.session.commit()

            except Exception:
                db.session.rollback()
               
                from app.api import subscricoes  # noqa
                from app.api import notificacoes_mobile  # noqa