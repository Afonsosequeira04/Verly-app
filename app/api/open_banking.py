from datetime import datetime

from urllib.parse import urlencode

from flask import current_app, jsonify, redirect, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.models import BankTransaction, ContaBancaria, OpenBankingConnection
from app.open_banking_service import (
    OpenBankingNotConfigured,
    new_reference,
    normalize_transaction,
    open_banking_client,
    open_banking_configured,
    parse_provider_datetime,
)


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
    return {
        'id': transaction.id,
        'account_id': transaction.conta_bancaria_id,
        'booked_at': transaction.booked_at.isoformat() if transaction.booked_at else None,
        'value_date': transaction.value_date.isoformat() if transaction.value_date else None,
        'amount': transaction.amount,
        'currency': transaction.currency,
        'description': transaction.description,
        'merchant_name': transaction.merchant_name,
        'categoria': transaction.categoria,
    }


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
                    continue
                db.session.add(BankTransaction(**values))
                imported += 1

        OpenBankingConnection.query.filter_by(user_id=user_id).update({
            'last_sync_at': datetime.utcnow(),
            'status': 'synced',
        })
        db.session.commit()
        return jsonify({'imported': imported})
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


def _provider_transactions(payload, provider):
    transactions = payload.get('transactions') or {}
    if provider == 'enablebanking':
        return transactions if isinstance(transactions, list) else []
    items = []
    for group_name in ('booked', 'pending'):
        items.extend(transactions.get(group_name, []))
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
