import hashlib
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

import jwt as pyjwt
import requests
from flask import current_app


class OpenBankingNotConfigured(RuntimeError):
    pass


class BaseOpenBankingClient:
    provider = None

    def institutions(self, country='PT'):
        raise NotImplementedError

    def create_connection(self, institution_id, redirect_url, reference, payload=None):
        raise NotImplementedError

    def complete_connection(self, conn, payload=None):
        raise NotImplementedError

    def account_details(self, account_id):
        raise NotImplementedError

    def account_transactions(self, account_id):
        raise NotImplementedError


class GoCardlessBankDataClient(BaseOpenBankingClient):
    provider = 'gocardless'

    def __init__(self):
        self.base_url = current_app.config['GOCARDLESS_BASE_URL'].rstrip('/') + '/'
        self.secret_id = current_app.config.get('GOCARDLESS_SECRET_ID')
        self.secret_key = current_app.config.get('GOCARDLESS_SECRET_KEY')
        if not self.secret_id or not self.secret_key:
            raise OpenBankingNotConfigured(
                'Open Banking provider is not configured. Set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY.'
            )

    def _url(self, path):
        return urljoin(self.base_url, path.lstrip('/'))

    def _request(self, method, path, **kwargs):
        response = requests.request(method, self._url(path), timeout=30, **kwargs)
        try:
            data = response.json()
        except ValueError:
            data = {'detail': response.text}
        if response.status_code >= 400:
            detail = data.get('detail') or data.get('summary') or data
            raise RuntimeError(f'GoCardless API error {response.status_code}: {detail}')
        return data

    def _access_token(self):
        data = self._request(
            'POST',
            '/token/new/',
            json={'secret_id': self.secret_id, 'secret_key': self.secret_key},
        )
        return data['access']

    def _auth_headers(self):
        return {'Authorization': f'Bearer {self._access_token()}'}

    def institutions(self, country='PT'):
        institutions = self._request(
            'GET',
            '/institutions/',
            headers=self._auth_headers(),
            params={'country': country.lower()},
        )
        return [
            {
                'id': item.get('id'),
                'name': item.get('name') or item.get('id'),
                'country': country.upper(),
                'logo': item.get('logo'),
                'raw': item,
            }
            for item in institutions
        ]

    def create_connection(self, institution_id, redirect_url, reference, payload=None):
        requisition = self._request(
            'POST',
            '/requisitions/',
            headers=self._auth_headers(),
            json={
                'institution_id': institution_id,
                'redirect': redirect_url,
                'reference': reference,
            },
        )
        return {
            'id': requisition.get('id'),
            'status': requisition.get('status') or 'linked',
            'auth_url': requisition.get('link'),
            'raw': requisition,
        }

    def complete_connection(self, conn, payload=None):
        requisition = self._request(
            'GET',
            f'/requisitions/{conn.requisition_id}/',
            headers=self._auth_headers(),
        )
        accounts = []
        for provider_account_id in requisition.get('accounts') or []:
            details = self.account_details(provider_account_id).get('account') or {}
            accounts.append({
                'uid': provider_account_id,
                'iban': details.get('iban'),
                'name': details.get('name') or conn.institution_id,
                'institution_name': conn.institution_id,
                'raw': details,
            })
        return {
            'id': conn.requisition_id,
            'status': requisition.get('status') or conn.status,
            'accounts': accounts,
            'raw': requisition,
        }

    def account_details(self, account_id):
        return self._request(
            'GET',
            f'/accounts/{account_id}/details/',
            headers=self._auth_headers(),
        )

    def account_transactions(self, account_id):
        return self._request(
            'GET',
            f'/accounts/{account_id}/transactions/',
            headers=self._auth_headers(),
        )


class EnableBankingClient(BaseOpenBankingClient):
    provider = 'enablebanking'

    def __init__(self):
        self.base_url = current_app.config['ENABLE_BANKING_BASE_URL'].rstrip('/') + '/'
        self.app_id = current_app.config.get('ENABLE_BANKING_APP_ID')
        self.private_key = self._private_key()
        if not self.app_id or not self.private_key:
            raise OpenBankingNotConfigured(
                'Enable Banking is not configured. Set ENABLE_BANKING_APP_ID and '
                'ENABLE_BANKING_PRIVATE_KEY or ENABLE_BANKING_PRIVATE_KEY_FILE.'
            )

    def _private_key(self):
        key = current_app.config.get('ENABLE_BANKING_PRIVATE_KEY')
        key_file = current_app.config.get('ENABLE_BANKING_PRIVATE_KEY_FILE')
        if key:
            return key.replace('\\n', '\n')
        if key_file:
            with open(key_file, 'r', encoding='utf-8') as fh:
                return fh.read()
        return None

    def _url(self, path):
        return urljoin(self.base_url, path.lstrip('/'))

    def _jwt(self):
        issued_at = int(time.time())
        body = {
            'iss': 'enablebanking.com',
            'aud': 'api.enablebanking.com',
            'iat': issued_at,
            'exp': issued_at + 3600,
        }
        return pyjwt.encode(
            body,
            self.private_key,
            algorithm='RS256',
            headers={'kid': self.app_id, 'typ': 'JWT'},
        )

    def _headers(self):
        return {
            'Authorization': f'Bearer {self._jwt()}',
            'Accept': 'application/json',
        }

    def _request(self, method, path, **kwargs):
        headers = kwargs.pop('headers', {})
        merged_headers = {**self._headers(), **headers}
        response = requests.request(
            method,
            self._url(path),
            timeout=30,
            headers=merged_headers,
            **kwargs,
        )
        try:
            data = response.json()
        except ValueError:
            data = {'detail': response.text}
        if response.status_code >= 400:
            detail = data.get('detail') or data.get('message') or data.get('error') or data
            raise RuntimeError(f'Enable Banking API error {response.status_code}: {detail}')
        return data

    def institutions(self, country='PT'):
        data = self._request(
            'GET',
            '/aspsps',
            params={'country': country.upper(), 'service': 'AIS'},
        )
        return [
            {
                'id': item.get('name'),
                'name': item.get('name'),
                'country': item.get('country') or country.upper(),
                'logo': item.get('logo'),
                'bic': item.get('bic'),
                'beta': item.get('beta'),
                'raw': item,
            }
            for item in data.get('aspsps', [])
        ]

    def create_connection(self, institution_id, redirect_url, reference, payload=None):
        payload = payload or {}
        country = (payload.get('country') or current_app.config['OPEN_BANKING_DEFAULT_COUNTRY']).upper()
        consent_days = int(current_app.config.get('ENABLE_BANKING_CONSENT_DAYS', 90))
        valid_until = datetime.now(timezone.utc) + timedelta(days=consent_days)
        request_body = {
            'access': {
                'balances': True,
                'transactions': True,
                'valid_until': valid_until.isoformat(),
            },
            'aspsp': {
                'name': payload.get('institution_name') or institution_id,
                'country': country,
            },
            'state': reference,
            'redirect_url': redirect_url,
            'psu_type': payload.get('psu_type') or 'personal',
        }
        if payload.get('language'):
            request_body['language'] = payload['language']

        authorization = self._request(
            'POST',
            '/auth',
            headers={'Content-Type': 'application/json'},
            json=request_body,
        )
        return {
            'id': authorization.get('authorization_id'),
            'status': 'authorizing',
            'auth_url': authorization.get('url'),
            'raw': authorization,
        }

    def complete_connection(self, conn, payload=None):
        payload = payload or {}
        code = payload.get('code')
        if code:
            session = self._request(
                'POST',
                '/sessions',
                headers={'Content-Type': 'application/json'},
                json={'code': code},
            )
        elif conn.requisition_id:
            session = self._request('GET', f'/sessions/{conn.requisition_id}')
        else:
            raise RuntimeError('Missing Enable Banking callback code.')

        accounts = []
        for account in session.get('accounts') or []:
            accounts.append({
                'uid': account.get('uid'),
                'iban': (account.get('account_id') or {}).get('iban'),
                'name': account.get('name') or account.get('details'),
                'institution_name': ((session.get('aspsp') or {}).get('name') or conn.institution_id),
                'raw': account,
            })
        for account in session.get('accounts_data') or []:
            if isinstance(account, dict) and account.get('uid'):
                accounts.append({
                    'uid': account.get('uid'),
                    'iban': None,
                    'name': None,
                    'institution_name': ((session.get('aspsp') or {}).get('name') or conn.institution_id),
                    'raw': account,
                })

        return {
            'id': session.get('session_id') or conn.requisition_id,
            'status': session.get('status') or 'AUTHORIZED',
            'accounts': _dedupe_accounts(accounts),
            'valid_until': (session.get('access') or {}).get('valid_until'),
            'raw': session,
        }

    def account_details(self, account_id):
        return self._request('GET', f'/accounts/{account_id}/details')

    def account_transactions(self, account_id):
        return self._request('GET', f'/accounts/{account_id}/transactions')


def open_banking_client(provider=None):
    provider = (provider or current_app.config.get('OPEN_BANKING_PROVIDER', 'enablebanking')).lower()
    if provider in ('enablebanking', 'enable_banking', 'enable'):
        return EnableBankingClient()
    if provider in ('gocardless', 'nordigen'):
        return GoCardlessBankDataClient()
    raise OpenBankingNotConfigured(f'Unsupported Open Banking provider: {provider}')


def open_banking_configured():
    provider = current_app.config.get('OPEN_BANKING_PROVIDER', 'enablebanking').lower()
    if provider in ('enablebanking', 'enable_banking', 'enable'):
        return bool(
            current_app.config.get('ENABLE_BANKING_APP_ID')
            and (
                current_app.config.get('ENABLE_BANKING_PRIVATE_KEY')
                or current_app.config.get('ENABLE_BANKING_PRIVATE_KEY_FILE')
            )
        )
    if provider in ('gocardless', 'nordigen'):
        return bool(
            current_app.config.get('GOCARDLESS_SECRET_ID')
            and current_app.config.get('GOCARDLESS_SECRET_KEY')
        )
    return False


def _dedupe_accounts(accounts):
    seen = set()
    deduped = []
    for account in accounts:
        uid = account.get('uid')
        if not uid or uid in seen:
            continue
        seen.add(uid)
        deduped.append(account)
    return deduped


def new_reference(user_id):
    return f'verly-{user_id}-{secrets.token_urlsafe(18)}'


def parse_provider_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def parse_provider_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        return None


def transaction_hash(user_id, account_id, transaction):
    stable_id = (
        transaction.get('transactionId')
        or transaction.get('internalTransactionId')
        or transaction.get('transaction_id')
        or transaction.get('entry_reference')
    )
    if not stable_id:
        stable_id = json.dumps(transaction, sort_keys=True, ensure_ascii=True)
    payload = f'{user_id}:{account_id}:{stable_id}'.encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def normalize_transaction(user_id, conta_bancaria_id, provider_account_id, transaction, provider):
    if provider == 'enablebanking':
        return _normalize_enable_banking_transaction(
            user_id,
            conta_bancaria_id,
            provider_account_id,
            transaction,
        )
    return _normalize_gocardless_transaction(user_id, conta_bancaria_id, provider_account_id, transaction)


def _normalize_gocardless_transaction(user_id, conta_bancaria_id, provider_account_id, transaction):
    amount_data = transaction.get('transactionAmount') or {}
    amount = _amount_to_float(amount_data.get('amount'))
    description = (
        transaction.get('remittanceInformationUnstructured')
        or transaction.get('additionalInformation')
        or transaction.get('debtorName')
        or transaction.get('creditorName')
        or ''
    )

    return {
        'user_id': user_id,
        'conta_bancaria_id': conta_bancaria_id,
        'provider': 'gocardless',
        'transaction_id': transaction.get('transactionId') or transaction.get('internalTransactionId'),
        'transaction_hash': transaction_hash(user_id, provider_account_id, transaction),
        'booked_at': parse_provider_date(transaction.get('bookingDate')),
        'value_date': parse_provider_date(transaction.get('valueDate')),
        'amount': amount,
        'currency': amount_data.get('currency') or 'EUR',
        'description': description,
        'merchant_name': transaction.get('creditorName') or transaction.get('debtorName'),
        'raw_json': json.dumps(transaction, ensure_ascii=True, sort_keys=True),
    }


def _normalize_enable_banking_transaction(user_id, conta_bancaria_id, provider_account_id, transaction):
    amount_data = transaction.get('transaction_amount') or {}
    amount = _amount_to_float(amount_data.get('amount'))
    if transaction.get('credit_debit_indicator') == 'DBIT' and amount > 0:
        amount *= -1

    remittance = transaction.get('remittance_information') or []
    if isinstance(remittance, list):
        description = ' '.join(str(item) for item in remittance if item)
    else:
        description = str(remittance)
    bank_code = transaction.get('bank_transaction_code') or {}
    description = description or bank_code.get('description') or transaction.get('reference_number') or ''

    creditor = transaction.get('creditor') or {}
    debtor = transaction.get('debtor') or {}

    return {
        'user_id': user_id,
        'conta_bancaria_id': conta_bancaria_id,
        'provider': 'enablebanking',
        'transaction_id': transaction.get('transaction_id') or transaction.get('entry_reference'),
        'transaction_hash': transaction_hash(user_id, provider_account_id, transaction),
        'booked_at': parse_provider_date(transaction.get('booking_date')),
        'value_date': parse_provider_date(transaction.get('value_date') or transaction.get('transaction_date')),
        'amount': amount,
        'currency': amount_data.get('currency') or 'EUR',
        'description': description,
        'merchant_name': creditor.get('name') or debtor.get('name'),
        'raw_json': json.dumps(transaction, ensure_ascii=True, sort_keys=True),
    }


def _amount_to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0
