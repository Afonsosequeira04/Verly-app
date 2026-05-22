"""
app/tasks/ai_insights.py — Task Celery: gera insights IA e guarda em cache Redis.
"""

import logging
from run import celery
from app.extensions import cache

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    name='tasks.gerar_insights',
    queue='ai',
    max_retries=2,
    default_retry_delay=60,
)
def gerar_insights_task(self, user_id: int):
    try:
        from app.api.insights import _build_context, _gerar_insights_com_llm
        ctx = _build_context(user_id)
        insights = _gerar_insights_com_llm(ctx)

        cache_key = f'insights:{user_id}'
        cache.set(cache_key, insights, timeout=900)  # 15 min

        logger.info(f'Insights gerados para user {user_id}')
        return {'status': 'ok', 'user_id': user_id}

    except Exception as exc:
        logger.exception(f'Insights IA falharam para user {user_id}: {exc}')
        raise self.retry(exc=exc)