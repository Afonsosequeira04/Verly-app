from datetime import datetime

from urllib.parse import urlencode

from flask import current_app, jsonify, redirect, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.extensions import cache
from app.financial_intelligence import build_financial_intelligence
from app.financial_records import (
    classify_bank_movement,
    financial_cache_keys,
    json_safe_financial_summary,
    normalize_text,
    summarize_expenses,
)
from app.models import BankTransaction, ContaBancaria, Meta, OpenBankingConnection, User
from app.open_banking_service import (
    OpenBankingNotConfigured,
    new_reference,
    normalize_transaction,
    open_banking_client,
    open_banking_configured,
    parse_provider_datetime,
)
from app.subscriptions import sync_bank_subscriptions


def _client_or_error(provider=None):
    try:
        return open_banking_client(provider), None
    except OpenBankingNotConfigured as exc:
        return None, (jsonify({'error': str(exc), 'code': 'OPEN_BANKING_NOT_CONFIGURED'}), 503)
    except Exception as exc:
        return None, (jsonify({'error': str(exc), 'code': 'OPEN_BANKING_PROVIDER_ERROR'}), 502)


def _connection_to_dict(conn):
    return {
        'id': conn.id,
        'provider': conn.provider,
        'institution_id': conn.institution_id,
        'requisition_id': conn.requisition_id,
        'reference': conn.reference,
        'status': conn.status,
        'redirect_url': conn.redirect_url,
        'last_sync_at': conn.last_sync_at.isoformat() if conn.last_sync_at else None,
        'created_at': conn.created_at.isoformat() if conn.created_at else None,
        'error': conn.error,
    }


def _account_to_dict(account):
    return {
        'id': account.id,
        'account_id': account.account_id,
        'institution_id': account.institution_id,
        'iban': account.iban,
        'nome_banco': account.nome_banco,
        'ativa': getattr(account, 'ativa', True),
        'ligada_em': account.ligada_em.isoformat() if account.ligada_em else None,
    }


def _transaction_to_dict(transaction):
    kind = classify_bank_movement(
        transaction.description,
        transaction.merchant_name,
        transaction.amount,
        categoria=transaction.categoria,
    )
    is_spending = (transaction.amount or 0) < 0 and kind == 'spending'
    return {
        'id': transaction.id,
        'account_id': transaction.conta_bancaria_id,
        'booked_at': transaction.booked_at.isoformat() if transaction.booked_at else None,
        'value_date': transaction.value_date.isoformat() if transaction.value_date else None,
        'amount': transaction.amount,
        'currency': transaction.currency,
        'signed_amount': transaction.amount,
        'description': transaction.description,
        'merchant_name': transaction.merchant_name,
        'categoria': transaction.categoria,
        'kind': kind,
        'is_spending': is_spending,
        'source': 'open_banking',
    }


def _invalidate_financial_cache(user_id):
    for key in financial_cache_keys(user_id):
        try:
            cache.delete(key)
        except Exception:
            current_app.logger.debug('Could not delete cache key %s', key, exc_info=True)


@api_bp.route('/open-banking/status', methods=['GET'])
@jwt_required()
def open_banking_status():
    user_id = int(get_jwt_identity())
    connections = (
        OpenBankingConnection.query
        .filter_by(user_id=user_id)
        .order_by(OpenBankingConnection.created_at.desc())
        .all()
    )
    accounts_count = ContaBancaria.query.filter_by(user_id=user_id).count()
    transactions_count = BankTransaction.query.filter_by(user_id=user_id).count()
    return jsonify({
        'provider': current_app.config.get('OPEN_BANKING_PROVIDER', 'enablebanking'),
        'configured': open_banking_configured(),
        'connections': [_connection_to_dict(conn) for conn in connections],
        'accounts_count': accounts_count,
        'transactions_count': transactions_count,
    })


@api_bp.route('/open-banking/institutions', methods=['GET'])
@jwt_required()
def open_banking_institutions():
    client, error = _client_or_error()
    if error:
        return error
    country = (request.args.get('country') or current_app.config['OPEN_BANKING_DEFAULT_COUNTRY']).upper()
    return jsonify({'provider': client.provider, 'institutions': client.institutions(country)})


@api_bp.route('/open-banking/connect', methods=['POST'])
@jwt_required()
def open_banking_connect():
    client, error = _client_or_error()
    if error:
        return error

    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    institution_id = (data.get('institution_id') or '').strip()
    if not institution_id:
        return jsonify({'error': 'institution_id e obrigatorio.'}), 400

    redirect_url = (
        data.get('redirect_url')
        or current_app.config.get('OPEN_BANKING_REDIRECT_URL')
        or f"{request.host_url.rstrip('/')}/api/v1/open-banking/callback"
    )
    reference = new_reference(user_id)
    conn = OpenBankingConnection(
        user_id=user_id,
        provider=client.provider,
        institution_id=institution_id,
        reference=reference,
        redirect_url=redirect_url,
        status='created',
    )
    db.session.add(conn)
    db.session.flush()

    try:
        connection = client.create_connection(institution_id, redirect_url, reference, data)
        conn.requisition_id = connection.get('id')
        conn.status = connection.get('status') or 'linked'
        db.session.commit()
        return jsonify({
            'connection': _connection_to_dict(conn),
            'auth_url': connection.get('auth_url'),
            'provider_response': connection.get('raw'),
        }), 201
    except Exception as exc:
        conn.status = 'error'
        conn.error = str(exc)
        db.session.commit()
        return jsonify({'error': str(exc), 'code': 'OPEN_BANKING_CONNECT_FAILED'}), 502


@api_bp.route('/open-banking/callback', methods=['GET', 'POST'])
@jwt_required(optional=True)
def open_banking_callback():
    data = request.get_json(silent=True) or {}
    reference = (
        data.get('reference')
        or data.get('state')
        or request.args.get('ref')
        or request.args.get('reference')
        or request.args.get('state')
    )
    requisition_id = data.get('requisition_id') or request.args.get('requisition_id')
    code = data.get('code') or request.args.get('code')
    error_code = data.get('error') or request.args.get('error')
    error_description = data.get('error_description') or request.args.get('error_description')

    query = OpenBankingConnection.query
    if reference:
        conn = query.filter_by(reference=reference).first()
    elif requisition_id:
        conn = query.filter_by(requisition_id=requisition_id).first()
    else:
        return jsonify({'error': 'reference ou requisition_id e obrigatorio.'}), 400

    if not conn:
        return jsonify({'error': 'Ligacao Open Banking nao encontrada.'}), 404

    if error_code:
        conn.status = 'error'
        conn.error = error_description or error_code
        db.session.commit()
        if request.method == 'GET':
            return _app_redirect(conn.reference, 'error', conn.error)
        return jsonify({'connection': _connection_to_dict(conn), 'error': conn.error}), 400

    client, error = _client_or_error(conn.provider)
    if error:
        return error

    try:
        connection = client.complete_connection(conn, {**data, 'code': code})
        conn.requisition_id = connection.get('id') or conn.requisition_id
        conn.status = connection.get('status') or conn.status
        conn.consent_expires_at = parse_provider_datetime(connection.get('valid_until'))
        accounts = connection.get('accounts') or []
        account_ids = []
        for account_data in accounts:
            provider_account_id = account_data.get('uid')
            if not provider_account_id:
                continue
            account_ids.append(provider_account_id)
            account = ContaBancaria.query.filter_by(
                user_id=conn.user_id,
                account_id=provider_account_id,
            ).first()
            if not account:
                account = ContaBancaria(
                    user_id=conn.user_id,
                    account_id=provider_account_id,
                    requisition_id=conn.requisition_id,
                    institution_id=conn.institution_id,
                    iban=account_data.get('iban'),
                    nome_banco=account_data.get('institution_name') or account_data.get('name') or conn.institution_id,
                    ativa=True,
                )
                db.session.add(account)
        db.session.commit()
        if request.method == 'GET':
            return _app_redirect(conn.reference, 'success')
        return jsonify({'connection': _connection_to_dict(conn), 'accounts': account_ids})
    except Exception as exc:
        conn.status = 'error'
        conn.error = str(exc)
        db.session.commit()
        if request.method == 'GET':
            return _app_redirect(conn.reference, 'error', str(exc))
        return jsonify({'error': str(exc), 'code': 'OPEN_BANKING_CALLBACK_FAILED'}), 502


@api_bp.route('/open-banking/accounts', methods=['GET'])
@jwt_required()
def open_banking_accounts():
    user_id = int(get_jwt_identity())
    accounts = (
        ContaBancaria.query
        .filter_by(user_id=user_id)
        .order_by(ContaBancaria.ligada_em.desc())
        .all()
    )
    return jsonify({'accounts': [_account_to_dict(account) for account in accounts]})


@api_bp.route('/open-banking/sync', methods=['POST'])
@jwt_required()
def open_banking_sync():
    user_id = int(get_jwt_identity())
    accounts = ContaBancaria.query.filter_by(user_id=user_id, ativa=True).all()
    connections = {
        conn.requisition_id: conn
        for conn in OpenBankingConnection.query.filter_by(user_id=user_id).all()
        if conn.requisition_id
    }
    clients = {}
    imported = 0
    subscriptions_detected = 0

    try:
        for account in accounts:
            conn = connections.get(account.requisition_id)
            provider = conn.provider if conn else current_app.config.get('OPEN_BANKING_PROVIDER', 'enablebanking')
            if provider not in clients:
                clients[provider] = open_banking_client(provider)
            client = clients[provider]
            payload = client.account_transactions(account.account_id)
            raw_transactions = _provider_transactions(payload, client.provider)
            for raw_transaction in raw_transactions:
                values = normalize_transaction(
                    user_id,
                    account.id,
                    account.account_id,
                    raw_transaction,
                    client.provider,
                )
                exists = BankTransaction.query.filter_by(
                    transaction_hash=values['transaction_hash']
                ).first()
                if exists:
                    if (
                        values.get('categoria')
                        and (not exists.categoria or exists.categoria == 'Outros')
                    ):
                        exists.categoria = values['categoria']
                    continue
                db.session.add(BankTransaction(**values))
                imported += 1

        OpenBankingConnection.query.filter_by(user_id=user_id).update({
            'last_sync_at': datetime.utcnow(),
            'status': 'synced',
        })
        db.session.commit()
        try:
            subscriptions_detected = sync_bank_subscriptions(user_id)
        except Exception:
            current_app.logger.warning('Open Banking subscription detection failed', exc_info=True)
        _invalidate_financial_cache(user_id)
        return jsonify({
            'imported': imported,
            'subscriptions_detected': subscriptions_detected,
        })
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc), 'code': 'OPEN_BANKING_SYNC_FAILED'}), 502


@api_bp.route('/open-banking/transactions', methods=['GET'])
@jwt_required()
def open_banking_transactions():
    user_id = int(get_jwt_identity())
    limit = min(max(int(request.args.get('limit', 50)), 1), 200)
    account_id = request.args.get('account_id')

    query = BankTransaction.query.filter_by(user_id=user_id)
    if account_id:
        query = query.filter_by(conta_bancaria_id=int(account_id))

    transactions = (
        query
        .order_by(BankTransaction.booked_at.desc().nullslast(), BankTransaction.id.desc())
        .limit(limit)
        .all()
    )
    return jsonify({'transactions': [_transaction_to_dict(item) for item in transactions]})


@api_bp.route('/open-banking/summary', methods=['GET'])
@jwt_required()
def open_banking_summary():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    requested_currency = request.args.get('currency')
    summary = summarize_expenses(user_id, currency=requested_currency)
    budget_currency = 'EUR'
    budget_summary = (
        summary if summary['currency'] == budget_currency
        else summarize_expenses(user_id, currency=budget_currency)
    )

    current_total = budget_summary['mes_atual']['total']
    budget = getattr(user, 'orcamento_mensal', 0) or 0
    budget_status = None
    if budget > 0:
        currency_mismatch = (
            summary['currency'] != budget_currency
            and summary['mes_atual']['total'] > 0
            and budget_summary['mes_atual']['num_registos'] == 0
        )
        pct = round((current_total / budget) * 100, 1) if not currency_mismatch else None
        budget_status = {
            'orcamento': round(budget, 2),
            'gasto': round(current_total, 2),
            'sobra': round(budget - current_total, 2),
            'pct': pct,
            'currency': budget_currency,
            'active_currency': summary['currency'],
            'currency_mismatch': currency_mismatch,
            'estado': (
                'moeda_diferente' if currency_mismatch
                else 'excedido' if pct >= 100
                else 'atencao' if pct >= 80
                else 'ok'
            ),
        }

    current_categories = {
        normalize_text(item['categoria']): item['valor']
        for item in budget_summary['mes_atual']['por_categoria']
    }
    metas = []
    for meta in Meta.query.filter_by(user_id=user_id).all():
        gasto = current_categories.get(normalize_text(meta.categoria), 0)
        pct = round((gasto / meta.valor_limite) * 100, 1) if meta.valor_limite > 0 else 0
        metas.append({
            'id': meta.id,
            'nome': meta.nome or meta.categoria,
            'categoria': meta.categoria,
            'limite': round(meta.valor_limite or 0, 2),
            'gasto': round(gasto, 2),
            'currency': budget_currency,
            'pct': pct,
            'estado': 'excedida' if gasto > meta.valor_limite else ('atencao' if pct >= 80 else 'ok'),
        })

    subscriptions = []
    try:
        from app.subscriptions import detect_subscriptions
        subs_data = detect_subscriptions(user_id)
        subscriptions = [
            {
                'nome': sub.get('nome'),
                'preco_mensal': sub.get('preco_mensal', 0),
                'currency': sub.get('currency') or summary['currency'],
                'meses_pago': sub.get('meses_pago', 1),
                'risk': sub.get('risk'),
                'fonte': sub.get('fonte'),
            }
            for sub in subs_data.get('subscriptions', [])
            if sub.get('fonte') == 'open_banking'
        ][:5]
    except Exception:
        current_app.logger.debug('Could not load Open Banking subscriptions', exc_info=True)

    return jsonify({
        'success': True,
        'summary': json_safe_financial_summary(summary),
        'financial_intelligence': build_financial_intelligence(user, summary, budget_summary, {'subscriptions': subscriptions}),
        'budget': budget_status,
        'metas': metas,
        'subscriptions': subscriptions,
    })


def _provider_transactions(payload, provider):
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    transactions = payload.get('transactions') or payload.get('items') or payload.get('data') or payload
    return _flatten_transactions(transactions)


def _flatten_transactions(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []

    items = []
    for group_name in ('booked', 'pending', 'transactions', 'items', 'data', 'entries'):
        if group_name in value:
            items.extend(_flatten_transactions(value.get(group_name)))
    return items


def _app_redirect(reference, status, error=None):
    return_url = current_app.config.get('OPEN_BANKING_APP_RETURN_URL')
    if not return_url:
        return jsonify({'reference': reference, 'status': status, 'error': error})
    params = {'reference': reference, 'status': status}
    if error:
        params['error_description'] = error
    separator = '&' if '?' in return_url else '?'
    return redirect(f'{return_url}{separator}{urlencode(params)}')
