import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'shopping-police-secret-2025')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shopping_police.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dados_utilizadores')
    app.config['STORAGE_FOLDER'] = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'storage_utilizadores')

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Precisas de fazer login primeiro.'

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from app.auth import auth_bp
    from app.dashboard import dashboard_bp
    from app.faturas import faturas_bp
    from app.chat import chat_bp
    from app.perfil import perfil_bp
    from app.exportar import exportar_bp
    from app.scoring import scoring_bp
    from app.subscriptions import subscriptions_bp
    from app.impulse import impulse_bp
    from app.reports import reports_bp
    from app.personality import personality_bp

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

    with app.app_context():
        db.create_all()
        _migrate_db()

    return app


def _migrate_db():
    from sqlalchemy import text
    from app import db
    
    migrations = [
        ("faturas", "categoria", "VARCHAR(50) DEFAULT 'Outros'"),
        ("faturas", "data_garantia", "VARCHAR(50)"),
        ("faturas", "data_devolucao", "VARCHAR(50)"),
        ("users", "notificacoes_email", "BOOLEAN DEFAULT 0"),
        ("users", "email_notificacoes", "VARCHAR(150)"),
        ("users", "personalidade", "VARCHAR(20) DEFAULT 'calm'"),
    ]
    
    for table, column, col_type in migrations:
        try:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            db.session.commit()
        except Exception:
            db.session.rollback()