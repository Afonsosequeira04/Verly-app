"""
app/__init__.py — Factory da aplicação Verly

"""

import os
import logging
import firebase_admin
from firebase_admin import credentials
from datetime import timedelta
from dotenv import load_dotenv

from flask import Flask, redirect, url_for, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect, CSRFError
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

load_dotenv()

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
jwt = JWTManager()
migrate = Migrate()


def _init_firebase(app):
    if firebase_admin._apps:
        return
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
        app.logger.warning('⚠️ firebase-service-account.json não encontrado. Login social desativado.')


def create_app(config_override=None):
    app = Flask(__name__, template_folder='../templates', static_folder='../static')

    from config import get_config
    cfg_class = config_override or get_config()
    app.config.from_object(cfg_class)

    app.config['JWT_SECRET_KEY'] = app.config.get('JWT_SECRET_KEY', os.getenv('SECRET_KEY', 'dev-secret'))
    app.config['JWT_ACCESS_TOKEN_EXPIRES']  = timedelta(minutes=15)
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)

    _init_firebase(app)
    _setup_logging(app)

    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    from app.extensions import cache, limiter
    cache.init_app(app)
    limiter.init_app(app)

    @jwt.token_in_blocklist_loader
    def check_if_revoked(jwt_header, jwt_payload):
        try:
            from app.extensions import get_redis_client
            jti = jwt_payload['jti']
            redis = get_redis_client()
            return redis.exists(f'blacklist:{jti}') == 1
        except Exception:
            return False

    CORS(
        app,
        resources={r"/api/*": {"origins": app.config.get('API_CORS_ORIGINS', [])}},
    )

    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Precisas de fazer login primeiro.'
    login_manager.login_message_category = 'warning'

    @app.after_request
    def set_security_headers(response):
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        if not app.debug:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        app.logger.warning(f'CSRF error: {e.description} — IP: {request.remote_addr}')
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'message': 'Sessão expirada. Recarrega a página e tenta novamente.', 'csrf_error': True}), 403
        from flask import flash
        flash('A tua sessão expirou. Faz login novamente.', 'error')
        return redirect(url_for('auth.login'))

    @app.errorhandler(413)
    def handle_too_large(e):
        max_mb = app.config.get('MAX_CONTENT_LENGTH', 10 * 1024 * 1024) // (1024 * 1024)
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'message': f'Ficheiro demasiado grande. Máximo permitido: {max_mb} MB.'}), 413
        from flask import flash
        flash(f'Ficheiro demasiado grande. Máximo: {max_mb} MB.', 'error')
        return redirect(url_for('faturas.faturas'))

    @app.errorhandler(429)
    def handle_rate_limit(e):
        return jsonify({'success': False, 'message': 'Demasiados pedidos. Tenta novamente mais tarde.', 'retry_after': str(e.retry_after) if hasattr(e, 'retry_after') else '60'}), 429

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

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
    from app.api            import api_bp

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

    app.register_blueprint(api_bp, url_prefix='/api/v1')
    csrf.exempt(api_bp)

    if app.config.get('AUTO_MIGRATE_ON_STARTUP', False):
        with app.app_context():
            db.create_all()
            _migrate_db()

    app.logger.info(f'Verly iniciada — ambiente: {os.getenv("FLASK_ENV", "development")}')
    return app


def _setup_logging(app: Flask):
    level = logging.DEBUG if app.config.get('DEBUG') else logging.INFO
    handler = logging.StreamHandler()
    handler.setLevel(level)
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s in %(module)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    handler.setFormatter(formatter)
    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(level)


def _migrate_db():
    """
    Adiciona colunas em falta nas tabelas existentes.
    Inspeciona o schema antes de alterar para funcionar em PostgreSQL e SQLite.
    """
    from sqlalchemy import inspect, text

    migrations = [
        # ── faturas ───────────────────────────────────────────────────────────
        ('faturas', 'categoria',      "VARCHAR(50) DEFAULT 'Outros'"),
        ('faturas', 'data_garantia',  'VARCHAR(50)'),
        ('faturas', 'data_devolucao', 'VARCHAR(50)'),
        ('faturas', 'notas',          'TEXT'),
        ('faturas', 'file_key',       'VARCHAR(512)'),
        # ── users ─────────────────────────────────────────────────────────────
        ('users',   'notificacoes_email',        'BOOLEAN DEFAULT false'),
        ('users',   'email_notificacoes',        'VARCHAR(150)'),
        ('users',   'personalidade',             "VARCHAR(20) DEFAULT 'calm'"),
        ('users',   'orcamento_mensal',          'FLOAT DEFAULT 0'),
        ('users',   'onboarding_completo',       'BOOLEAN DEFAULT false'),
        ('users',   'google_id',                 'VARCHAR(128)'),
        ('users',   'avatar_url',                'VARCHAR(512)'),
        ('users',   'email_confirmado',          'BOOLEAN DEFAULT true'),
        ('users',   'email_confirm_token',       'VARCHAR(100)'),
        ('users',   'email_confirm_expiry',      'TIMESTAMP'),
        ('users',   'avatar',                    'VARCHAR(255)'),
        ('users',   'streak_dias',               'INTEGER DEFAULT 0'),
        ('users',   'streak_ultima_atualizacao', 'TIMESTAMP'),
        ('users',   'lingua',                    "VARCHAR(10) DEFAULT 'pt'"),
        ('users',   'moeda_preferida',           "VARCHAR(10) DEFAULT 'EUR'"),
        ('users',   'fcm_token',                 'VARCHAR(512)'),
        ('users',   'fcm_token_updated',         'TIMESTAMP'),
        ('users',   'push_ativas',               'BOOLEAN DEFAULT true'),
        # ── grupos ────────────────────────────────────────────────────────────
        ('grupos',  'streak_dias',               'INTEGER DEFAULT 0'),
        ('grupos',  'streak_ultima_data',        'DATE'),
        # ── desafios ──────────────────────────────────────────────────────────
        ('desafios', 'criado_por_ia',            'BOOLEAN DEFAULT false'),
        ('desafios', 'gerado_ia',                'BOOLEAN DEFAULT false'),
        ('desafios', 'push_enviado',             'BOOLEAN DEFAULT false'),
        # ── desafio_participantes ─────────────────────────────────────────────
        ('desafio_participantes', 'push_ranking_enviado', 'BOOLEAN DEFAULT false'),
        # ── recompensas ───────────────────────────────────────────────────────
        ('recompensas', 'cor',           "VARCHAR(20) DEFAULT '#FFD700'"),
        ('recompensas', 'desbloqueada_em', 'TIMESTAMP'),
        # ── mensagens_grupo ───────────────────────────────────────────────────
        ('mensagens_grupo', 'editada',   'BOOLEAN DEFAULT false'),
        ('contas_bancarias', 'ativa',     'BOOLEAN DEFAULT true'),
        ('conversas', 'thread_id',        'VARCHAR(36)'),
        ('conversas', 'thread_title',     'VARCHAR(160)'),
    ]

    with db.engine.connect() as conn:
        inspector = inspect(conn)
        table_names = set(inspector.get_table_names())
        column_cache = {}

        for table, column, col_type in migrations:
            if table not in table_names:
                continue
            if table not in column_cache:
                column_cache[table] = {
                    item['name'] for item in inspector.get_columns(table)
                }
            if column in column_cache[table]:
                continue

            try:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                conn.commit()
                column_cache[table].add(column)
                logging.getLogger(__name__).info('Migration added column %s.%s', table, column)
            except Exception as e:
                conn.rollback()
                # Ignora erro "already exists" (PG code 42701) silenciosamente
                err = str(e)
                if 'already exists' in err or '42701' in err:
                    pass  # coluna já existe, tudo bem
                else:
                    logging.getLogger(__name__).warning('Migration %s.%s failed: %s', table, column, err)
