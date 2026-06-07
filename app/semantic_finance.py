"""
Safe semantic finance helpers backed by Qdrant.

This module is the single place where product features ask for semantic
financial memory. It keeps Qdrant optional at runtime: when Qdrant is down, the
app continues to answer using PostgreSQL summaries.
"""

import logging

logger = logging.getLogger(__name__)


def semantic_search(user_id: int, query: str, top_k: int = 6) -> list[dict]:
    query = (query or '').strip()
    if not query:
        return []
    try:
        from app.qdrant_service import query_user
        raw_results = query_user(user_id, query, top_k=top_k)
    except Exception as exc:
        logger.warning('Semantic search unavailable for user %s: %s', user_id, exc)
        return []
    return [_normalise_result(item) for item in raw_results]


def semantic_context(user_id: int, query: str, top_k: int = 6) -> str:
    results = semantic_search(user_id, query, top_k=top_k)
    return format_semantic_context(results)


def format_semantic_context(results: list[dict]) -> str:
    if not results:
        return ''
    lines = ['\n--- MEMORIA SEMANTICA RELEVANTE ---']
    for index, item in enumerate(results[:8], start=1):
        source = 'movimento bancario' if item.get('source_type') == 'bank_transaction' else 'fatura'
        title = item.get('title') or item.get('merchant') or item.get('loja') or 'Registo financeiro'
        amount = item.get('amount')
        currency = item.get('currency') or 'EUR'
        amount_text = f"{amount:.2f} {currency}" if isinstance(amount, (int, float)) else ''
        date_text = item.get('date') or item.get('booked_at') or ''
        category = item.get('categoria') or 'Outros'
        lines.append(
            f"{index}. {source}: {title} | {amount_text} | {category} | {date_text}".strip()
        )
        if item.get('text'):
            lines.append(f"   Contexto: {item['text'][:280]}")
    return '\n'.join(lines)


def semantic_examples_for_insights(user_id: int) -> list[dict]:
    queries = [
        'maiores gastos recorrentes e compras repetidas',
        'restaurantes lazer tecnologia compras impulsivas subscricoes',
        'movimentos bancarios estranhos ou despesas relevantes',
    ]
    seen = set()
    examples = []
    for query in queries:
        for item in semantic_search(user_id, query, top_k=4):
            key = (
                item.get('source_type'),
                item.get('fatura_id') or item.get('transaction_db_id') or item.get('text'),
            )
            if key in seen:
                continue
            seen.add(key)
            examples.append(item)
            if len(examples) >= 8:
                return examples
    return examples


def suggest_category_from_memory(user_id: int, text: str, min_score: float = 0.45) -> str | None:
    """Suggest a category from semantically similar records already indexed."""
    results = semantic_search(user_id, text, top_k=4)
    votes = {}
    for item in results:
        category = item.get('categoria')
        if not category or str(category).lower() == 'outros':
            continue
        score = item.get('score')
        try:
            score = float(score or 0)
        except Exception:
            score = 0
        if score < min_score:
            continue
        votes[category] = votes.get(category, 0) + max(score, 0.1)
    if not votes:
        return None
    return max(votes, key=votes.get)


def _normalise_result(item: dict) -> dict:
    source_type = item.get('source_type') or ('bank_transaction' if item.get('transaction_db_id') else 'fatura')
    amount = item.get('amount')
    if amount is None:
        amount = item.get('total')
    try:
        amount = round(float(amount), 2)
    except Exception:
        amount = None
    title = (
        item.get('merchant')
        or item.get('loja')
        or item.get('description')
        or item.get('text', '').split('.')[0]
    )
    return {
        'source_type': source_type,
        'score': item.get('score'),
        'text': item.get('text') or '',
        'title': title,
        'loja': item.get('loja'),
        'merchant': item.get('merchant'),
        'description': item.get('description'),
        'categoria': item.get('categoria') or 'Outros',
        'amount': amount,
        'currency': item.get('currency') or 'EUR',
        'date': item.get('data'),
        'booked_at': item.get('booked_at'),
        'fatura_id': item.get('fatura_id'),
        'transaction_db_id': item.get('transaction_db_id'),
        'transaction_id': item.get('transaction_id'),
    }
