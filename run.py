"""
run.py — Ponto de entrada da aplicação Verly

Iniciar Flask:
    python run.py
    flask run

Iniciar Celery worker:
    celery -A run.celery worker --loglevel=info -Q default,ocr,ai,emails

Iniciar Flower (monitor):
    celery -A run.celery flower --port=5555
"""

from app import create_app
from app.celery_app import make_celery

flask_app = create_app()
celery = make_celery(flask_app)

# ── Importar todas as tasks para o Celery as registar ──────────────────────────
with flask_app.app_context():
    from app.tasks import ocr, emails, ai_insights, qdrant_task  # noqa: F401

if __name__ == '__main__':
    import os

    host = os.getenv('HOST', '127.0.0.1')
    port = int(os.getenv('PORT', 5000))
    flask_app.run(host=host, port=port, debug=True)
