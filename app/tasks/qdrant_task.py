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


@celery.task(
    bind=True,
    name='tasks.indexar_movimentos_bancarios',
    queue='ai',
    max_retries=2,
    default_retry_delay=45,
)
def indexar_movimentos_bancarios_task(self, transaction_ids: list[int]):
    try:
        from app.models import BankTransaction
        from app.qdrant_service import upsert_bank_transaction

        indexed = 0
        for transaction_id in transaction_ids or []:
            transaction = BankTransaction.query.get(transaction_id)
            if not transaction:
                logger.warning(f'Qdrant index: movimento {transaction_id} nao encontrado.')
                continue
            upsert_bank_transaction(transaction)
            indexed += 1

        logger.info(f'Qdrant: {indexed} movimentos bancarios indexados.')
        return {'status': 'indexed', 'count': indexed}

    except Exception as exc:
        logger.exception(f'Qdrant index de movimentos falhou: {exc}')
        raise self.retry(exc=exc)


@celery.task(
    bind=True,
    name='tasks.reindexar_memoria_financeira',
    queue='ai',
    max_retries=1,
    default_retry_delay=90,
)
def reindexar_memoria_financeira_task(self, user_id: int):
    try:
        from app.models import BankTransaction, Fatura
        from app.qdrant_service import upsert_bank_transaction, upsert_fatura

        faturas = Fatura.query.filter_by(user_id=user_id).all()
        transactions = BankTransaction.query.filter_by(user_id=user_id).all()

        indexed_faturas = 0
        indexed_transactions = 0
        for fatura in faturas:
            upsert_fatura(fatura)
            indexed_faturas += 1
        for transaction in transactions:
            upsert_bank_transaction(transaction)
            indexed_transactions += 1

        logger.info(
            'Qdrant: user %s reindexed (%s faturas, %s movimentos).',
            user_id,
            indexed_faturas,
            indexed_transactions,
        )
        return {
            'status': 'indexed',
            'user_id': user_id,
            'faturas': indexed_faturas,
            'movimentos': indexed_transactions,
        }

    except Exception as exc:
        logger.exception(f'Reindexacao Qdrant falhou para user {user_id}: {exc}')
        raise self.retry(exc=exc)
