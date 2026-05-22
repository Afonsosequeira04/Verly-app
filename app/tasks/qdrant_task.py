"""
app/tasks/qdrant_task.py — Task Celery: indexa fatura no Qdrant para RAG.
"""

import logging
from run import celery

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    name='tasks.indexar_fatura',
    queue='ai',
    max_retries=2,
    default_retry_delay=30,
)
def indexar_fatura_task(self, fatura_id: int):
    try:
        from app.models import Fatura
        from app.qdrant_service import upsert_fatura

        fatura = Fatura.query.get(fatura_id)
        if not fatura:
            logger.warning(f'Qdrant index: fatura {fatura_id} não encontrada.')
            return {'status': 'not_found'}

        upsert_fatura(fatura)
        logger.info(f'Qdrant: fatura {fatura_id} indexada.')
        return {'status': 'indexed', 'fatura_id': fatura_id}

    except Exception as exc:
        logger.exception(f'Qdrant index falhou para fatura {fatura_id}: {exc}')
        raise self.retry(exc=exc)