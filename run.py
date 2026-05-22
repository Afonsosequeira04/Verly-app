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

if __name__ == '__main__':
    flask_app.run(debug=True)