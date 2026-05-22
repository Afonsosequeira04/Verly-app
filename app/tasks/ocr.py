"""
app/tasks/ocr.py — Task Celery: processa OCR de uma fatura em background.
"""

import logging
from run import celery
from app.models import Fatura
from app import db

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    name='tasks.processar_ocr',
    queue='ocr',
    max_retries=3,
    default_retry_delay=30,
)
def processar_ocr_task(self, fatura_id: int):
    try:
        fatura = Fatura.query.get(fatura_id)
        if not fatura:
            logger.warning(f'OCR: fatura {fatura_id} não encontrada.')
            return {'status': 'not_found'}

        from app.ai import extract_invoice_info
        from app.r2_service import get_signed_url

        if fatura.file_key:
            file_source = get_signed_url(fatura.file_key, expires_in=300)
        else:
            import os
            from flask import current_app
            file_source = os.path.join(
                current_app.config['UPLOAD_FOLDER'],
                str(fatura.user_id),
                fatura.nome_ficheiro,
            )

        info = extract_invoice_info(file_source, fatura.nome_ficheiro)

        fatura.loja           = info.get('loja')          or fatura.loja
        fatura.total          = info.get('total')         or fatura.total
        fatura.items          = info.get('items')         or fatura.items
        fatura.categoria      = info.get('categoria')     or fatura.categoria
        fatura.data_compra    = info.get('data_compra')   or fatura.data_compra
        fatura.data_garantia  = info.get('data_garantia')  or fatura.data_garantia
        fatura.data_devolucao = info.get('data_devolucao') or fatura.data_devolucao
        db.session.commit()

        # Invalidar cache do dashboard após novo OCR
        from app.extensions import cache
        cache.delete(f'dashboard:{fatura.user_id}')
        cache.delete(f'estatisticas:{fatura.user_id}')

        from app.tasks.qdrant_task import indexar_fatura_task
        indexar_fatura_task.delay(fatura_id)

        logger.info(f'OCR OK: fatura {fatura_id}')
        return {'status': 'ok', 'fatura_id': fatura_id}

    except Exception as exc:
        logger.exception(f'OCR falhou para fatura {fatura_id}: {exc}')
        raise self.retry(exc=exc)