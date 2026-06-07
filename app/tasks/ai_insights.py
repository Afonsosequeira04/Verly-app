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
        from app.api.insights import _build_context, _gerar_insights_llm
        from app.models import User

        ctx = _build_context(user_id)
        user = User.query.get(user_id)
        personalidade = getattr(user, 'personalidade', 'calm') or 'calm'
        insights = _gerar_insights_llm(ctx, personalidade)

        # Guardar o resultado completo (mesmo formato que o frontend espera)
        result = {
            'success': True,
            'insights': insights,
            'resumo': {
                'total_gasto':         ctx['total_gasto_mes'],
                'num_faturas':         ctx['num_faturas_mes'],
                'variacao_pct':        ctx['variacao_pct'],
                'variacao_subiu':      (ctx['variacao_pct'] or 0) > 0,
                'orcamento_mensal':    ctx['orcamento_mensal'],
                'rendimento_mensal':   ctx['rendimento_mensal'],
                'pct_orcamento':       round((ctx['total_gasto_mes'] / ctx['orcamento_mensal'] * 100), 1)
                                       if ctx['orcamento_mensal'] > 0 else None,
                'pct_rendimento':      round((ctx['total_gasto_mes'] / ctx['rendimento_mensal'] * 100), 1)
                                       if ctx['rendimento_mensal'] > 0 else None,
                'top_categorias':      ctx['top_categorias'],
                'metas':               ctx['metas'],
                'previsao_mensal':     ctx['previsao_mensal'],
                'subscricoes':         ctx['subscricoes_detetadas'],
                'total_subscricoes':   ctx['total_subscricoes'],
                'historico_mensal':    ctx['historico_mensal'],
                'regra_5030_20':       ctx['regra_5030_20'],
                'itens_por_categoria': ctx['itens_por_categoria'],
                'financial_intelligence': ctx['financial_intelligence'],
            },
            'financial_intelligence': ctx['financial_intelligence'],
            'personalidade': personalidade,
            'sem_dados': ctx['num_faturas_mes'] == 0 and ctx['total_gasto_mes'] == 0,
        }

        cache_key = f'insights:{user_id}'
        cache.set(cache_key, result, timeout=900)  # 15 min

        logger.info(f'Insights gerados para user {user_id}')
        return {'status': 'ok', 'user_id': user_id}

    except Exception as exc:
        logger.exception(f'Insights IA falharam para user {user_id}: {exc}')
        raise self.retry(exc=exc)
