"""
Semantic finance API.

GET  /api/v1/semantic/search?q=...
POST /api/v1/semantic/reindex
"""

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.api import api_bp
from app.models import BankTransaction, Fatura
from app.semantic_finance import semantic_search


@api_bp.route('/semantic/search', methods=['GET'])
@jwt_required()
def semantic_search_endpoint():
    user_id = int(get_jwt_identity())
    query = (request.args.get('q') or request.args.get('query') or '').strip()
    limit = min(max(int(request.args.get('limit', 8)), 1), 20)
    if not query:
        return jsonify({'results': [], 'query': query})

    results = semantic_search(user_id, query, top_k=limit)
    return jsonify({
        'query': query,
        'count': len(results),
        'results': results,
    })


@api_bp.route('/semantic/reindex', methods=['POST'])
@jwt_required()
def semantic_reindex_endpoint():
    user_id = int(get_jwt_identity())
    faturas_count = Fatura.query.filter_by(user_id=user_id).count()
    transactions_count = BankTransaction.query.filter_by(user_id=user_id).count()

    try:
        from app.tasks.qdrant_task import reindexar_memoria_financeira_task
        reindexar_memoria_financeira_task.delay(user_id)
        return jsonify({
            'status': 'queued',
            'faturas': faturas_count,
            'movimentos': transactions_count,
        }), 202
    except Exception:
        from app.qdrant_service import upsert_bank_transaction, upsert_fatura

        indexed_faturas = 0
        indexed_transactions = 0
        for fatura in Fatura.query.filter_by(user_id=user_id).all():
            upsert_fatura(fatura)
            indexed_faturas += 1
        for transaction in BankTransaction.query.filter_by(user_id=user_id).all():
            upsert_bank_transaction(transaction)
            indexed_transactions += 1
        return jsonify({
            'status': 'indexed',
            'faturas': indexed_faturas,
            'movimentos': indexed_transactions,
        })
