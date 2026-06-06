"""
app/extensions.py — Instâncias únicas de todas as extensões Flask/Celery.
Importar daqui em vez de criar instâncias espalhadas pelo código.
"""

import os
import boto3
import redis as redis_py
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# ── Cache Redis ───────────────────────────────────────────────────────────────
cache = Cache()


def _limiter_storage_uri():
    if os.getenv('FLASK_ENV', 'development').lower() == 'development':
        return os.getenv('LIMITER_STORAGE_URI', 'memory://')
    return os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# ── Rate Limiter (Redis, multi-worker safe) ───────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri=_limiter_storage_uri(),
)


def get_redis_client() -> redis_py.Redis:
    """Retorna cliente Redis com decode_responses=True."""
    return redis_py.from_url(
        os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        decode_responses=True,
    )


def get_r2_client():
    """Retorna cliente boto3 apontado ao Cloudflare R2."""
    return boto3.client(
        's3',
        endpoint_url=os.getenv('R2_ENDPOINT_URL'),
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto',
    )
