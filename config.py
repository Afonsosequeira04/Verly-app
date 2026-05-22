"""
config.py — Configuração por ambiente (development / production)
"""

import os
import secrets
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


class Config:
    """Configuração base partilhada por todos os ambientes."""

    SECRET_KEY = os.getenv('SECRET_KEY') or secrets.token_hex(32)

    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = 3600

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
    }

    MAX_CONTENT_LENGTH = int(os.getenv('MAX_UPLOAD_MB', 10)) * 1024 * 1024
    UPLOAD_FOLDER = str(BASE_DIR / 'dados_utilizadores')
    STORAGE_FOLDER = str(BASE_DIR / 'storage_utilizadores')

    ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.txt'}
    ALLOWED_MIME_TYPES = {
        'application/pdf',
        'image/png',
        'image/jpeg',
        'text/plain',
    }

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 86400 * 7

    GROQ_API_KEY = os.getenv('GROQ_API_KEY')

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

    # ── Flask-Caching ─────────────────────────────────────────────────────────
    CACHE_TYPE = 'RedisCache'
    CACHE_REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    CACHE_DEFAULT_TIMEOUT = 300

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL     = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

    # ── Cloudflare R2 ─────────────────────────────────────────────────────────
    R2_ENDPOINT_URL      = os.getenv('R2_ENDPOINT_URL')
    R2_ACCESS_KEY_ID     = os.getenv('R2_ACCESS_KEY_ID')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
    R2_BUCKET_NAME       = os.getenv('R2_BUCKET_NAME', 'verly-docs')
    R2_PUBLIC_URL        = os.getenv('R2_PUBLIC_URL', '')

    # ── Qdrant ────────────────────────────────────────────────────────────────
    QDRANT_URL        = os.getenv('QDRANT_URL', 'http://localhost:6333')
    QDRANT_API_KEY    = os.getenv('QDRANT_API_KEY', '')
    QDRANT_COLLECTION = os.getenv('QDRANT_COLLECTION', 'verly_docs')

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY', 'dev-secret')


class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        f'sqlite:///{BASE_DIR / "shopping_police.db"}'
    )
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_ECHO = False


class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_size': 10,
        'max_overflow': 20,
        'pool_timeout': 30,
    }

    @classmethod
    def validate(cls):
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            print('[ERRO FATAL] DATABASE_URL não definida em produção.', file=sys.stderr)
            sys.exit(1)
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        cls.SQLALCHEMY_DATABASE_URI = db_url


class TestingConfig(Config):
    TESTING = True
    DEBUG = False
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SECRET_KEY = 'test-secret-key'


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
}


def get_config():
    env = os.getenv('FLASK_ENV', 'development').lower()
    cfg = config_map.get(env, DevelopmentConfig)
    if env == 'production':
        cfg.validate()
    elif env == 'development' and not os.getenv('SECRET_KEY'):
        print('[AVISO] SECRET_KEY não definida. A usar chave temporária.')
    return cfg