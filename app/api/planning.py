import html
import os
import re
import secrets
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, datetime, timedelta
from urllib.parse import quote, quote_plus

import requests
from flask import Response, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import or_

from app import db
from app.api import api_bp
from app.financial_records import clean_currency, convert_currency, summarize_expenses
from app.models import (
    BankTransaction,
    Bill,
    CalendarConnection,
    ContaBancaria,
    FamilyCategoryBudget,
    FamilyExpenseTag,
    FamilyInvite,
    FamilyPlan,
    FamilySharedAccount,
    Fatura,
    User,
    family_member,
)


LANGUAGES = {'pt', 'en', 'es', 'fr', 'de', 'it'}
CURRENCIES = {'EUR', 'USD', 'GBP', 'DKK', 'SEK', 'NOK'}
RECURRENCES = {'none', 'monthly', 'quarterly', 'yearly'}
FAMILY_ROLES = {'owner', 'admin', 'partner', 'child', 'viewer'}
MANAGE_ROLES = {'owner', 'admin'}


def _user_id():
    return int(get_jwt_identity())


def _parse_date(value):
    if isinstance(value, date):
        return value
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(str(value or '').strip()[:10], fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value, default=0):
    try:
        if value in (None, ''):
            return default
        return float(str(value).replace(',', '.'))
    except (TypeError, ValueError):
        return default


def _date_from_fatura(fatura):
    raw = getattr(fatura, 'data_compra', None)
    if raw:
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
            try:
                return datetime.strptime(str(raw).strip()[:10], fmt).date()
            except ValueError:
                continue
    uploaded = getattr(fatura, 'data_upload', None)
    return uploaded.date() if uploaded and hasattr(uploaded, 'date') else uploaded


def _month_bounds():
    today = date.today()
    start = date(today.year, today.month, 1)
    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)
    return start, end


def _role_label(role):
    return {
        'owner': 'Owner',
        'admin': 'Admin',
        'partner': 'Parceiro',
        'child': 'Crianca',
        'viewer': 'So leitura',
    }.get(role or 'partner', 'Parceiro')


def _member_role_map(family_id):
    rows = db.session.execute(
        family_member.select().where(family_member.c.family_id == family_id)
    ).mappings().all()
    return {
        int(row['user_id']): (row.get('role') or 'partner')
        for row in rows
    }


def _family_for_user(user_id):
    return (
        FamilyPlan.query
        .join(family_member, FamilyPlan.id == family_member.c.family_id)
        .filter(family_member.c.user_id == user_id, FamilyPlan.ativo == True)
        .first()
    )


def _family_for_owner(user_id):
    return FamilyPlan.query.filter_by(owner_id=user_id, ativo=True).first()


def _current_role(family, user_id):
    if not family:
        return None
    if family.owner_id == user_id:
        return 'owner'
    row = db.session.execute(
        family_member.select().where(
            family_member.c.family_id == family.id,
            family_member.c.user_id == user_id,
        )
    ).mappings().first()
    return (row or {}).get('role')


def _permissions_for_role(role):
    role = role or 'viewer'
    return {
        'can_manage': role in MANAGE_ROLES,
        'can_invite': role in MANAGE_ROLES,
        'can_manage_accounts': role in MANAGE_ROLES or role == 'partner',
        'can_edit_budget': role in MANAGE_ROLES,
        'can_mark_expenses': role in MANAGE_ROLES or role == 'partner',
        'can_view': role in FAMILY_ROLES,
    }


def _require_family(user_id):
    family = _family_for_user(user_id)
    if not family:
        return None, None, (jsonify({'error': 'Cria ou aceita primeiro um plano familiar.'}), 404)
    role = _current_role(family, user_id)
    return family, role, None


def _invite_link(token):
    app_url = os.getenv('APP_URL', '').rstrip('/')
    deep_link = f'verly://family-invite/{token}'
    return f'{app_url}/family-invite/{token}' if app_url else deep_link


def _invite_to_dict(invite, include_link=False):
    data = {
        'id': invite.id,
        'family_id': invite.family_id,
        'family_name': invite.family.nome if invite.family else None,
        'invited_email': invite.invited_email,
        'invited_user_id': invite.invited_user_id,
        'role': invite.role or 'partner',
        'role_label': _role_label(invite.role),
        'status': invite.status or 'pending',
        'created_at': invite.created_at.isoformat() if invite.created_at else None,
        'expires_at': invite.expires_at.isoformat() if invite.expires_at else None,
        'token': invite.token,
    }
    if include_link:
        data['invite_link'] = _invite_link(invite.token)
        data['deep_link'] = f'verly://family-invite/{invite.token}'
    return data


def _send_family_invite_email(invite, family, inviter):
    api_key = os.getenv('RESEND_API_KEY', '')
    if not api_key:
        return False
    try:
        import resend

        resend.api_key = api_key
        from_email = os.getenv('EMAIL_FROM', 'Verly <noreply@verly.app>')
        link = _invite_link(invite.token)
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#080810;color:#EEEEF8;border-radius:16px;">
          <h2 style="margin:0 0 10px;">Convite para {html.escape(family.nome)}</h2>
          <p>{html.escape(inviter.nome)} convidou-te para partilhar orcamento e despesas na Verly.</p>
          <p>Papel inicial: <strong>{html.escape(_role_label(invite.role))}</strong></p>
          <p><a href="{link}" style="display:inline-block;background:#7C6FE0;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Abrir convite</a></p>
        </div>
        """
        resend.Emails.send({
            'from': from_email,
            'to': [invite.invited_email],
            'subject': f'Convite para {family.nome} na Verly',
            'html': html_body,
        })
        return True
    except Exception:
        current_app.logger.warning('Family invite email failed', exc_info=True)
        return False


def _bill_to_dict(bill, display_currency=None):
    display_currency = clean_currency(display_currency or bill.currency)
    converted_value, converted = convert_currency(bill.valor, bill.currency, display_currency)
    today = date.today()
    days = (bill.data_vencimento - today).days if bill.data_vencimento else None
    return {
        'id': bill.id,
        'titulo': bill.titulo,
        'categoria': bill.categoria or 'Obrigacao',
        'valor': round(converted_value, 2),
        'currency': display_currency,
        'original_valor': round(float(bill.valor or 0), 2),
        'original_currency': clean_currency(bill.currency),
        'converted': converted,
        'data_vencimento': bill.data_vencimento.isoformat() if bill.data_vencimento else None,
        'dias_restantes': days,
        'recorrencia': bill.recorrencia or 'none',
        'notas': bill.notas,
        'pago': bool(bill.pago),
        'lembrar_dias_antes': bill.lembrar_dias_antes or 0,
        'calendar_event_id': bill.calendar_event_id,
        'criado_em': bill.criado_em.isoformat() if bill.criado_em else None,
    }


def _tag_map(family_id):
    tags = FamilyExpenseTag.query.filter_by(family_id=family_id).all()
    return {
        (tag.source_type, int(tag.source_id)): tag
        for tag in tags
    }


def _family_accounts(family):
    roles = _member_role_map(family.id)
    member_ids = list(roles.keys())
    selected = {
        item.conta_bancaria_id: item
        for item in FamilySharedAccount.query.filter_by(family_id=family.id, active=True).all()
    }
    accounts = []
    if member_ids:
        rows = (
            ContaBancaria.query
            .filter(ContaBancaria.user_id.in_(member_ids), ContaBancaria.ativa == True)
            .order_by(ContaBancaria.nome_banco.asc(), ContaBancaria.id.asc())
            .all()
        )
        users = {user.id: user for user in User.query.filter(User.id.in_(member_ids)).all()}
        for account in rows:
            owner = users.get(account.user_id)
            accounts.append({
                'id': account.id,
                'user_id': account.user_id,
                'owner_name': owner.nome if owner else 'Membro',
                'nome_banco': account.nome_banco or 'Conta bancaria',
                'iban': account.iban,
                'selected': account.id in selected,
            })
    return accounts, set(selected.keys())


def _record_payload(source_type, source_id, user, merchant, amount, currency, category, spent_date, tag=None, extra=None):
    converted, _ = convert_currency(amount or 0, currency or 'EUR', extra.get('display_currency') if extra else currency or 'EUR')
    return {
        'id': f'{source_type}:{source_id}',
        'source_type': source_type,
        'source_id': source_id,
        'user_id': user.id if user else None,
        'member_name': user.nome if user else 'Membro',
        'merchant': merchant or 'Despesa',
        'amount': round(abs(converted), 2),
        'currency': (extra or {}).get('display_currency') or clean_currency(currency or 'EUR'),
        'category': (tag.category if tag and tag.category else category) or 'Outros',
        'date': spent_date.isoformat() if spent_date else None,
        'include_family': bool(tag.include_family) if tag else True,
    }


def _family_records(family, display_currency='EUR'):
    display_currency = clean_currency(display_currency)
    start, end = _month_bounds()
    roles = _member_role_map(family.id)
    member_ids = list(roles.keys())
    users = {user.id: user for user in User.query.filter(User.id.in_(member_ids)).all()} if member_ids else {}
    accounts, selected_account_ids = _family_accounts(family)
    tags = _tag_map(family.id)
    records = []
    mode = 'selected_accounts' if selected_account_ids else 'all_member_expenses'

    if selected_account_ids:
        tx_query = BankTransaction.query.filter(
            BankTransaction.conta_bancaria_id.in_(selected_account_ids),
            BankTransaction.booked_at >= start,
            BankTransaction.booked_at < end,
            BankTransaction.amount < 0,
        )
    elif member_ids:
        tx_query = BankTransaction.query.filter(
            BankTransaction.user_id.in_(member_ids),
            BankTransaction.booked_at >= start,
            BankTransaction.booked_at < end,
            BankTransaction.amount < 0,
        )
    else:
        tx_query = BankTransaction.query.filter(False)

    for tx in tx_query.all():
        tag = tags.get(('bank_transaction', tx.id))
        if tag and not tag.include_family:
            continue
        records.append(_record_payload(
            'bank_transaction',
            tx.id,
            users.get(tx.user_id),
            tx.merchant_name or tx.description,
            abs(tx.amount or 0),
            tx.currency or 'EUR',
            tx.categoria or 'Outros',
            tx.booked_at,
            tag=tag,
            extra={'display_currency': display_currency},
        ))

    fatura_query = Fatura.query.filter(Fatura.user_id.in_(member_ids)).all() if member_ids else []
    for fatura in fatura_query:
        spent_date = _date_from_fatura(fatura)
        if not spent_date or not (start <= spent_date < end):
            continue
        tag = tags.get(('fatura', fatura.id))
        if selected_account_ids and not (tag and tag.include_family):
            continue
        if tag and not tag.include_family:
            continue
        records.append(_record_payload(
            'fatura',
            fatura.id,
            users.get(fatura.user_id),
            fatura.loja or fatura.nome_ficheiro,
            fatura.total or 0,
            'EUR',
            fatura.categoria or 'Outros',
            spent_date,
            tag=tag,
            extra={'display_currency': display_currency},
        ))

    records.sort(key=lambda row: row.get('date') or '', reverse=True)
    return records, accounts, mode


def _category_budget_summary(family, records, display_currency='EUR'):
    spent_by_category = defaultdict(float)
    for row in records:
        spent_by_category[row.get('category') or 'Outros'] += float(row.get('amount') or 0)

    budgets = []
    for budget in FamilyCategoryBudget.query.filter_by(family_id=family.id).order_by(FamilyCategoryBudget.category.asc()).all():
        amount, _ = convert_currency(budget.amount or 0, budget.currency or 'EUR', display_currency)
        spent = spent_by_category.get(budget.category, 0)
        budgets.append({
            'id': budget.id,
            'category': budget.category,
            'amount': round(amount, 2),
            'spent': round(spent, 2),
            'remaining': round(amount - spent, 2),
            'pct': round((spent / amount) * 100, 1) if amount > 0 else None,
            'currency': display_currency,
        })
    return budgets


def _family_alerts(family, total, budget, category_budgets, records, accounts, mode):
    alerts = []
    if mode == 'all_member_expenses':
        alerts.append({
            'type': 'setup_accounts',
            'level': 'info',
            'title': 'Escolhe as contas familiares',
            'message': 'Enquanto nao escolheres contas, o plano usa os gastos gerais dos membros.',
        })
    if len(family.membros.all()) <= 1:
        alerts.append({
            'type': 'invite_member',
            'level': 'info',
            'title': 'Plano com um so membro',
            'message': 'Convida alguem para ativar o controlo familiar a serio.',
        })
    if budget > 0 and total > budget:
        alerts.append({
            'type': 'budget_over',
            'level': 'danger',
            'title': 'Orcamento familiar ultrapassado',
            'message': f'O plano ja passou {round(((total / budget) - 1) * 100)}% acima do limite.',
        })
    elif budget > 0 and total >= budget * 0.85:
        alerts.append({
            'type': 'budget_warning',
            'level': 'warning',
            'title': 'Orcamento quase no limite',
            'message': f'Ja usaram {round((total / budget) * 100)}% do orcamento familiar.',
        })
    for budget_row in category_budgets:
        pct = budget_row.get('pct') or 0
        if pct >= 100:
            alerts.append({
                'type': 'category_over',
                'level': 'danger',
                'title': f'{budget_row["category"]} passou o budget',
                'message': f'Gasto: {budget_row["spent"]:.2f} {budget_row["currency"]}.',
            })
        elif pct >= 85:
            alerts.append({
                'type': 'category_warning',
                'level': 'warning',
                'title': f'{budget_row["category"]} quase no limite',
                'message': f'{round(pct)}% do budget da categoria usado.',
            })
    if records:
        top = max(records, key=lambda row: row.get('amount') or 0)
        if top.get('amount', 0) >= max(50, total * 0.25):
            alerts.append({
                'type': 'large_expense',
                'level': 'info',
                'title': 'Despesa familiar grande',
                'message': f'{top["merchant"]} teve impacto de {top["amount"]:.2f} {top["currency"]}.',
            })
    pending = FamilyInvite.query.filter_by(family_id=family.id, status='pending').count()
    if pending:
        alerts.append({
            'type': 'pending_invites',
            'level': 'info',
            'title': f'{pending} convite(s) pendente(s)',
            'message': 'A familia ainda nao esta completa.',
        })
    return alerts[:6]


def _family_timeline(family, records, category_budgets):
    events = []
    for row in records[:8]:
        events.append({
            'type': 'expense',
            'date': row.get('date'),
            'title': row.get('merchant') or 'Despesa',
            'message': f'{row.get("member_name")} gastou {row.get("amount"):.2f} {row.get("currency")} em {row.get("category")}.',
        })
    for invite in FamilyInvite.query.filter_by(family_id=family.id).order_by(FamilyInvite.created_at.desc()).limit(4).all():
        events.append({
            'type': f'invite_{invite.status}',
            'date': invite.created_at.isoformat() if invite.created_at else None,
            'title': 'Convite familiar',
            'message': f'{invite.invited_email} - {invite.status}.',
        })
    for budget in category_budgets:
        if budget.get('pct') and budget['pct'] >= 85:
            events.append({
                'type': 'category_budget',
                'date': datetime.utcnow().isoformat(),
                'title': f'Budget {budget["category"]}',
                'message': f'{round(budget["pct"])}% usado.',
            })
    events.sort(key=lambda row: row.get('date') or '', reverse=True)
    return events[:10]


def _family_to_dict(family, display_currency='EUR', current_user_id=None):
    if not family:
        return None
    display_currency = clean_currency(display_currency)
    roles = _member_role_map(family.id)
    records, accounts, sharing_mode = _family_records(family, display_currency)
    total = sum(float(row.get('amount') or 0) for row in records)
    budget, _ = convert_currency(family.orcamento_mensal, family.currency, display_currency)
    by_member = defaultdict(float)
    for row in records:
        by_member[row.get('user_id')] += float(row.get('amount') or 0)

    members = []
    for member in family.membros.all():
        role = 'owner' if member.id == family.owner_id else roles.get(member.id, 'partner')
        members.append({
            'id': member.id,
            'nome': member.nome,
            'email': member.email,
            'role': role,
            'role_label': _role_label(role),
            'gasto_mes': round(by_member.get(member.id, 0), 2),
            'currency': display_currency,
        })

    category_budgets = _category_budget_summary(family, records, display_currency)
    role = _current_role(family, current_user_id) if current_user_id else None
    pending_invites = [
        _invite_to_dict(invite, include_link=True)
        for invite in FamilyInvite.query.filter_by(family_id=family.id, status='pending').order_by(FamilyInvite.created_at.desc()).all()
    ]

    return {
        'id': family.id,
        'nome': family.nome,
        'owner_id': family.owner_id,
        'orcamento_mensal': round(budget, 2),
        'currency': display_currency,
        'membros': members,
        'member_ids': [member['id'] for member in members],
        'me_role': role,
        'permissions': _permissions_for_role(role),
        'total_gasto_mes': round(total, 2),
        'sobra': round(budget - total, 2),
        'pct_orcamento': round((total / budget) * 100, 1) if budget > 0 else None,
        'sharing_mode': sharing_mode,
        'accounts': accounts,
        'category_budgets': category_budgets,
        'recent_expenses': records[:8],
        'alerts': _family_alerts(family, total, budget, category_budgets, records, accounts, sharing_mode),
        'timeline': _family_timeline(family, records, category_budgets),
        'pending_invites': pending_invites,
    }


@api_bp.route('/preferences', methods=['GET', 'PATCH'])
@jwt_required()
def preferences():
    user = User.query.get_or_404(_user_id())
    if request.method == 'PATCH':
        data = request.get_json(silent=True) or {}
        if clean_currency(data.get('moeda_preferida')) in CURRENCIES:
            user.moeda_preferida = clean_currency(data.get('moeda_preferida'))
        if (data.get('lingua') or '').strip().lower() in LANGUAGES:
            user.lingua = (data.get('lingua') or '').strip().lower()
        db.session.commit()
    return jsonify({
        'success': True,
        'moeda_preferida': clean_currency(getattr(user, 'moeda_preferida', 'EUR')),
        'lingua': getattr(user, 'lingua', 'pt') or 'pt',
        'currencies': sorted(CURRENCIES),
        'languages': sorted(LANGUAGES),
    })


@api_bp.route('/bills', methods=['GET', 'POST'])
@jwt_required()
def bills():
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    display_currency = clean_currency(request.args.get('currency') or getattr(user, 'moeda_preferida', 'EUR'))

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        due_date = _parse_date(data.get('data_vencimento') or data.get('due_date'))
        if not due_date:
            return jsonify({'error': 'data_vencimento e obrigatoria.'}), 400
        title = (data.get('titulo') or data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'titulo e obrigatorio.'}), 400
        try:
            value = float(str(data.get('valor') or data.get('amount') or 0).replace(',', '.'))
        except (TypeError, ValueError):
            return jsonify({'error': 'valor invalido.'}), 400
        recurrence = (data.get('recorrencia') or 'none').strip()
        if recurrence not in RECURRENCES:
            recurrence = 'none'
        bill = Bill(
            user_id=user_id,
            titulo=title[:160],
            categoria=(data.get('categoria') or 'Obrigacao').strip()[:80],
            valor=max(0, value),
            currency=clean_currency(data.get('currency') or display_currency),
            data_vencimento=due_date,
            recorrencia=recurrence,
            notas=(data.get('notas') or '').strip() or None,
            lembrar_dias_antes=max(0, int(data.get('lembrar_dias_antes') or 3)),
        )
        db.session.add(bill)
        db.session.commit()
        return jsonify({'bill': _bill_to_dict(bill, display_currency)}), 201

    include_paid = request.args.get('include_paid') == '1'
    query = Bill.query.filter_by(user_id=user_id)
    if not include_paid:
        query = query.filter_by(pago=False)
    items = query.order_by(Bill.data_vencimento.asc(), Bill.id.asc()).all()
    upcoming = [item for item in items if item.data_vencimento and item.data_vencimento <= date.today() + timedelta(days=30)]
    total_next_30 = 0
    for item in upcoming:
        converted, _ = convert_currency(item.valor, item.currency, display_currency)
        total_next_30 += converted
    return jsonify({
        'bills': [_bill_to_dict(item, display_currency) for item in items],
        'summary': {
            'currency': display_currency,
            'total_next_30_days': round(total_next_30, 2),
            'overdue_count': sum(1 for item in items if item.data_vencimento and item.data_vencimento < date.today() and not item.pago),
            'upcoming_count': len(upcoming),
        },
    })


@api_bp.route('/bills/<int:bill_id>', methods=['PATCH', 'DELETE'])
@jwt_required()
def bill_detail(bill_id):
    user_id = _user_id()
    bill = Bill.query.filter_by(id=bill_id, user_id=user_id).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(bill)
        db.session.commit()
        return jsonify({'success': True})

    data = request.get_json(silent=True) or {}
    if 'titulo' in data and data['titulo']:
        bill.titulo = data['titulo'].strip()[:160]
    if 'categoria' in data:
        bill.categoria = (data.get('categoria') or 'Obrigacao').strip()[:80]
    if 'valor' in data:
        try:
            bill.valor = max(0, float(str(data.get('valor')).replace(',', '.')))
        except (TypeError, ValueError):
            pass
    if 'currency' in data:
        bill.currency = clean_currency(data.get('currency'))
    if 'data_vencimento' in data:
        parsed = _parse_date(data.get('data_vencimento'))
        if parsed:
            bill.data_vencimento = parsed
    if 'recorrencia' in data and data.get('recorrencia') in RECURRENCES:
        bill.recorrencia = data.get('recorrencia')
    if 'notas' in data:
        bill.notas = (data.get('notas') or '').strip() or None
    if 'pago' in data:
        bill.pago = bool(data.get('pago'))
    db.session.commit()
    return jsonify({'bill': _bill_to_dict(bill, request.args.get('currency'))})


@api_bp.route('/calendar/status', methods=['GET'])
@jwt_required()
def calendar_status():
    user_id = _user_id()
    connections = CalendarConnection.query.filter_by(user_id=user_id).all()
    providers = {conn.provider: conn for conn in connections}
    return jsonify({
        'providers': [
            {
                'provider': provider,
                'configured': provider in providers and providers[provider].status == 'connected',
                'status': providers[provider].status if provider in providers else 'not_configured',
                'account_email': providers[provider].account_email if provider in providers else None,
                'last_sync_at': providers[provider].last_sync_at.isoformat() if provider in providers and providers[provider].last_sync_at else None,
            }
            for provider in ('google', 'apple')
        ],
        'ics_url_hint': '/api/v1/calendar/export.ics',
    })


@api_bp.route('/calendar/connect', methods=['POST'])
@jwt_required()
def calendar_connect():
    data = request.get_json(silent=True) or {}
    provider = (data.get('provider') or '').strip().lower()
    if provider not in {'google', 'apple'}:
        return jsonify({'error': 'provider invalido.'}), 400
    configured = bool(current_app.config.get('GOOGLE_CALENDAR_CLIENT_ID')) if provider == 'google' else False
    status = 'ready_for_oauth' if configured else 'manual_ics'
    connection = CalendarConnection.query.filter_by(user_id=_user_id(), provider=provider).first()
    if not connection:
        connection = CalendarConnection(user_id=_user_id(), provider=provider, status=status)
        db.session.add(connection)
    else:
        connection.status = status
    db.session.commit()
    return jsonify({
        'provider': provider,
        'status': status,
        'configured': configured,
        'message': 'Usa export.ics por agora; OAuth fica disponivel quando as credenciais estiverem configuradas.',
    })


@api_bp.route('/calendar/export.ics', methods=['GET'])
@jwt_required()
def calendar_export():
    user_id = _user_id()
    bills = Bill.query.filter_by(user_id=user_id, pago=False).order_by(Bill.data_vencimento.asc()).all()
    now = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Verly//Bills//PT']
    for bill in bills:
        start = bill.data_vencimento.strftime('%Y%m%d')
        uid = f'bill-{bill.id}@verly'
        summary = quote(f'Verly: {bill.titulo}', safe=' :/-')
        desc = quote(f'{bill.categoria or ""} {bill.valor or 0:.2f} {bill.currency or "EUR"}', safe=' :/-')
        lines.extend([
            'BEGIN:VEVENT',
            f'UID:{uid}',
            f'DTSTAMP:{now}',
            f'DTSTART;VALUE=DATE:{start}',
            f'SUMMARY:{summary}',
            f'DESCRIPTION:{desc}',
            'END:VEVENT',
        ])
    lines.append('END:VCALENDAR')
    return Response('\r\n'.join(lines), mimetype='text/calendar')


@api_bp.route('/familia', methods=['GET', 'POST', 'PATCH'])
@jwt_required()
def familia():
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    display_currency = clean_currency(request.args.get('currency') or getattr(user, 'moeda_preferida', 'EUR'))

    if request.method == 'POST':
        existing = _family_for_user(user_id)
        if existing:
            return jsonify({
                'family': _family_to_dict(existing, display_currency, user_id),
                'already_exists': True,
            })
        data = request.get_json(silent=True) or {}
        family = FamilyPlan(
            nome=(data.get('nome') or f'Familia de {user.nome}').strip()[:120],
            owner_id=user_id,
            orcamento_mensal=max(0, _parse_amount(data.get('orcamento_mensal'), 0)),
            currency=clean_currency(data.get('currency') or display_currency),
        )
        db.session.add(family)
        db.session.flush()
        db.session.execute(family_member.insert().values(family_id=family.id, user_id=user_id, role='owner'))
        db.session.commit()
        return jsonify({'family': _family_to_dict(family, display_currency, user_id)}), 201

    if request.method == 'PATCH':
        family, role, error = _require_family(user_id)
        if error:
            return error
        if role not in MANAGE_ROLES:
            return jsonify({'error': 'Sem permissao para editar o plano.'}), 403
        data = request.get_json(silent=True) or {}
        if data.get('nome') is not None:
            family.nome = (data.get('nome') or family.nome).strip()[:120]
        if data.get('orcamento_mensal') is not None:
            family.orcamento_mensal = max(0, _parse_amount(data.get('orcamento_mensal'), family.orcamento_mensal or 0))
        if data.get('currency'):
            family.currency = clean_currency(data.get('currency'))
        db.session.commit()
        return jsonify({'family': _family_to_dict(family, display_currency, user_id)})

    family = (
        FamilyPlan.query
        .join(family_member, FamilyPlan.id == family_member.c.family_id)
        .filter(family_member.c.user_id == user_id, FamilyPlan.ativo == True)
        .first()
    )
    incoming = _incoming_invites(user)
    return jsonify({
        'family': _family_to_dict(family, display_currency, user_id) if family else None,
        'incoming_invites': [_invite_to_dict(invite, include_link=True) for invite in incoming],
    })


@api_bp.route('/familia/invite', methods=['POST'])
@jwt_required()
def familia_invite():
    user_id = _user_id()
    inviter = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    role = (data.get('role') or 'partner').strip().lower()
    if role not in FAMILY_ROLES or role == 'owner':
        role = 'partner'
    if not email:
        return jsonify({'error': 'Email obrigatorio.'}), 400
    target = User.query.filter(db.func.lower(User.email) == email).first()
    family = _family_for_user(user_id)
    if not family:
        return jsonify({'error': 'Cria primeiro um plano familiar.'}), 400
    current_role = _current_role(family, user_id)
    if current_role not in MANAGE_ROLES:
        return jsonify({'error': 'Sem permissao para convidar membros.'}), 403
    if target and target.id == user_id:
        return jsonify({'error': 'Nao podes convidar a tua propria conta.'}), 400

    member_exists = target and db.session.execute(
        family_member.select().where(
            family_member.c.family_id == family.id,
            family_member.c.user_id == target.id,
        )
    ).fetchone()
    if member_exists:
        return jsonify({'error': 'Este utilizador ja esta no plano.'}), 409

    invite = FamilyInvite.query.filter_by(
        family_id=family.id,
        invited_email=email,
        status='pending',
    ).first()
    if not invite:
        invite = FamilyInvite(
            family_id=family.id,
            invited_email=email,
            invited_user_id=target.id if target else None,
            token=secrets.token_urlsafe(24),
            role=role,
            status='pending',
            created_by=user_id,
            expires_at=datetime.utcnow() + timedelta(days=14),
        )
        db.session.add(invite)
    else:
        invite.role = role
        invite.invited_user_id = target.id if target else invite.invited_user_id
        invite.expires_at = datetime.utcnow() + timedelta(days=14)

    db.session.flush()
    email_sent = _send_family_invite_email(invite, family, inviter)
    db.session.commit()
    return jsonify({
        'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id),
        'invite': _invite_to_dict(invite, include_link=True),
        'email_sent': email_sent,
    }), 201


def _incoming_invites(user):
    if not user:
        return []
    now = datetime.utcnow()
    return (
        FamilyInvite.query
        .filter(
            FamilyInvite.status == 'pending',
            or_(
                FamilyInvite.invited_user_id == user.id,
                db.func.lower(FamilyInvite.invited_email) == user.email.lower(),
            ),
            or_(FamilyInvite.expires_at == None, FamilyInvite.expires_at >= now),
        )
        .order_by(FamilyInvite.created_at.desc())
        .all()
    )


@api_bp.route('/familia/invites', methods=['GET'])
@jwt_required()
def familia_invites():
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    family = _family_for_user(user_id)
    outgoing = []
    if family and _current_role(family, user_id) in MANAGE_ROLES:
        outgoing = [
            _invite_to_dict(invite, include_link=True)
            for invite in FamilyInvite.query.filter_by(family_id=family.id).order_by(FamilyInvite.created_at.desc()).limit(30).all()
        ]
    return jsonify({
        'incoming': [_invite_to_dict(invite, include_link=True) for invite in _incoming_invites(user)],
        'outgoing': outgoing,
    })


@api_bp.route('/familia/invites/<token>/accept', methods=['POST'])
@jwt_required()
def familia_accept_invite(token):
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    invite = FamilyInvite.query.filter_by(token=token, status='pending').first()
    if not invite:
        return jsonify({'error': 'Convite invalido ou ja respondido.'}), 404
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        invite.status = 'expired'
        db.session.commit()
        return jsonify({'error': 'Convite expirado.'}), 410
    if invite.invited_user_id and invite.invited_user_id != user_id:
        return jsonify({'error': 'Este convite pertence a outra conta.'}), 403
    if invite.invited_email.lower() != user.email.lower() and invite.invited_user_id is None:
        return jsonify({'error': 'Entra com o email convidado para aceitar.'}), 403

    exists = db.session.execute(
        family_member.select().where(
            family_member.c.family_id == invite.family_id,
            family_member.c.user_id == user_id,
        )
    ).fetchone()
    if not exists:
        db.session.execute(family_member.insert().values(
            family_id=invite.family_id,
            user_id=user_id,
            role=invite.role or 'partner',
            joined_at=datetime.utcnow(),
        ))
    invite.status = 'accepted'
    invite.invited_user_id = user_id
    invite.responded_at = datetime.utcnow()
    db.session.commit()
    family = FamilyPlan.query.get(invite.family_id)
    return jsonify({'success': True, 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/familia/invites/<token>/decline', methods=['POST'])
@jwt_required()
def familia_decline_invite(token):
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    invite = FamilyInvite.query.filter_by(token=token, status='pending').first()
    if not invite:
        return jsonify({'error': 'Convite invalido ou ja respondido.'}), 404
    if invite.invited_user_id and invite.invited_user_id != user_id:
        return jsonify({'error': 'Este convite pertence a outra conta.'}), 403
    if invite.invited_email.lower() != user.email.lower() and invite.invited_user_id is None:
        return jsonify({'error': 'Entra com o email convidado para recusar.'}), 403
    invite.status = 'declined'
    invite.responded_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/familia/members/<int:member_id>', methods=['PATCH', 'DELETE'])
@jwt_required()
def familia_member_detail(member_id):
    user_id = _user_id()
    family, role, error = _require_family(user_id)
    if error:
        return error
    if role not in MANAGE_ROLES:
        return jsonify({'error': 'Sem permissao para gerir membros.'}), 403
    if member_id == family.owner_id:
        return jsonify({'error': 'O owner nao pode ser removido nem alterado aqui.'}), 400

    exists = db.session.execute(
        family_member.select().where(
            family_member.c.family_id == family.id,
            family_member.c.user_id == member_id,
        )
    ).fetchone()
    if not exists:
        return jsonify({'error': 'Membro nao encontrado.'}), 404

    if request.method == 'DELETE':
        db.session.execute(
            family_member.delete().where(
                family_member.c.family_id == family.id,
                family_member.c.user_id == member_id,
            )
        )
        db.session.commit()
        return jsonify({'success': True, 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})

    data = request.get_json(silent=True) or {}
    next_role = (data.get('role') or 'partner').strip().lower()
    if next_role not in FAMILY_ROLES or next_role == 'owner':
        return jsonify({'error': 'Papel invalido.'}), 400
    db.session.execute(
        family_member.update()
        .where(family_member.c.family_id == family.id, family_member.c.user_id == member_id)
        .values(role=next_role)
    )
    db.session.commit()
    return jsonify({'success': True, 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/familia/accounts', methods=['GET', 'PATCH'])
@jwt_required()
def familia_accounts():
    user_id = _user_id()
    family, role, error = _require_family(user_id)
    if error:
        return error
    if request.method == 'PATCH':
        if not _permissions_for_role(role)['can_manage_accounts']:
            return jsonify({'error': 'Sem permissao para gerir contas.'}), 403
        data = request.get_json(silent=True) or {}
        raw_ids = data.get('account_ids') or []
        try:
            requested = {int(item) for item in raw_ids}
        except Exception:
            requested = set()
        roles = _member_role_map(family.id)
        allowed_user_ids = set(roles.keys()) if role in MANAGE_ROLES else {user_id}
        accounts = ContaBancaria.query.filter(
            ContaBancaria.user_id.in_(allowed_user_ids),
            ContaBancaria.ativa == True,
        ).all()
        allowed_account_ids = {account.id for account in accounts}
        requested = requested.intersection(allowed_account_ids)

        existing = {
            item.conta_bancaria_id: item
            for item in FamilySharedAccount.query.filter(
                FamilySharedAccount.family_id == family.id,
                FamilySharedAccount.conta_bancaria_id.in_(allowed_account_ids),
            ).all()
        }
        for account in accounts:
            item = existing.get(account.id)
            should_active = account.id in requested
            if item:
                item.active = should_active
            elif should_active:
                db.session.add(FamilySharedAccount(
                    family_id=family.id,
                    conta_bancaria_id=account.id,
                    user_id=account.user_id,
                    added_by=user_id,
                    active=True,
                ))
        db.session.commit()
    return jsonify({'accounts': _family_accounts(family)[0], 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/familia/category-budgets', methods=['POST'])
@jwt_required()
def familia_category_budget():
    user_id = _user_id()
    family, role, error = _require_family(user_id)
    if error:
        return error
    if role not in MANAGE_ROLES:
        return jsonify({'error': 'Sem permissao para gerir budgets.'}), 403
    data = request.get_json(silent=True) or {}
    category = (data.get('category') or data.get('categoria') or '').strip()[:80]
    if not category:
        return jsonify({'error': 'Categoria obrigatoria.'}), 400
    budget = FamilyCategoryBudget.query.filter_by(family_id=family.id, category=category).first()
    if not budget:
        budget = FamilyCategoryBudget(family_id=family.id, category=category, created_by=user_id)
        db.session.add(budget)
    budget.amount = max(0, _parse_amount(data.get('amount') or data.get('valor'), 0))
    budget.currency = clean_currency(data.get('currency') or family.currency)
    db.session.commit()
    return jsonify({'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/familia/category-budgets/<int:budget_id>', methods=['DELETE'])
@jwt_required()
def familia_delete_category_budget(budget_id):
    user_id = _user_id()
    family, role, error = _require_family(user_id)
    if error:
        return error
    if role not in MANAGE_ROLES:
        return jsonify({'error': 'Sem permissao para gerir budgets.'}), 403
    budget = FamilyCategoryBudget.query.filter_by(id=budget_id, family_id=family.id).first_or_404()
    db.session.delete(budget)
    db.session.commit()
    return jsonify({'success': True, 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/familia/expenses/tag', methods=['PATCH'])
@jwt_required()
def familia_tag_expense():
    user_id = _user_id()
    family, role, error = _require_family(user_id)
    if error:
        return error
    if not _permissions_for_role(role)['can_mark_expenses']:
        return jsonify({'error': 'Sem permissao para marcar despesas.'}), 403
    data = request.get_json(silent=True) or {}
    source_type = (data.get('source_type') or '').strip()
    source_id = int(data.get('source_id') or 0)
    if source_type not in {'bank_transaction', 'fatura'} or source_id <= 0:
        return jsonify({'error': 'Despesa invalida.'}), 400
    tag = FamilyExpenseTag.query.filter_by(family_id=family.id, source_type=source_type, source_id=source_id).first()
    if not tag:
        tag = FamilyExpenseTag(
            family_id=family.id,
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            created_by=user_id,
        )
        db.session.add(tag)
    tag.include_family = bool(data.get('include_family', True))
    if data.get('category') is not None:
        tag.category = (data.get('category') or '').strip()[:80] or None
    db.session.commit()
    return jsonify({'success': True, 'family': _family_to_dict(family, request.args.get('currency') or family.currency, user_id)})


@api_bp.route('/discover/news', methods=['GET'])
@jwt_required()
def discover_news():
    country = (request.args.get('country') or 'PT').strip().upper()[:2]
    language = (request.args.get('language') or 'pt').strip().lower()[:2]
    query = request.args.get('q') or _news_query(country, language)
    api_key = current_app.config.get('FINANCIAL_NEWS_API_KEY')

    if api_key:
        try:
            response = requests.get(
                'https://gnews.io/api/v4/search',
                params={
                    'q': query,
                    'lang': language,
                    'country': country.lower(),
                    'max': 10,
                    'apikey': api_key,
                },
                timeout=6,
            )
            response.raise_for_status()
            articles = response.json().get('articles', [])
            return jsonify({
                'country': country,
                'language': language,
                'source': 'gnews',
                'articles': [
                    {
                        'title': item.get('title'),
                        'description': item.get('description'),
                        'url': item.get('url'),
                        'source': (item.get('source') or {}).get('name'),
                        'published_at': item.get('publishedAt'),
                    }
                    for item in articles
                ],
            })
        except Exception:
            current_app.logger.warning('Financial news provider failed', exc_info=True)

    rss_articles = _rss_news(country, language, query)
    if rss_articles:
        return jsonify({'country': country, 'language': language, 'source': 'google_news_rss', 'articles': rss_articles})

    fallback = _fallback_news(country)
    return jsonify({'country': country, 'language': language, 'source': 'fallback', 'articles': fallback})


def _news_query(country, language='pt'):
    if country == 'PT':
        return 'Portugal financas OR economia OR inflacao OR juros OR bancos OR consumo'
    if language == 'pt':
        return 'financas economia inflacao juros bancos consumo'
    return 'personal finance economy inflation interest rates banking consumer spending'


def _rss_news(country, language, query):
    locale = {
        'PT': ('pt-PT', 'PT:pt'),
        'BR': ('pt-BR', 'BR:pt-419'),
        'US': ('en-US', 'US:en'),
        'GB': ('en-GB', 'GB:en'),
        'ES': ('es-ES', 'ES:es'),
        'FR': ('fr-FR', 'FR:fr'),
        'DE': ('de-DE', 'DE:de'),
    }.get(country, (f'{language}-{country}', f'{country}:{language}'))
    url = (
        'https://news.google.com/rss/search?'
        f'q={quote_plus(query)}&hl={locale[0]}&gl={country}&ceid={locale[1]}'
    )
    try:
        response = requests.get(url, timeout=7, headers={'User-Agent': 'Verly/1.0'})
        response.raise_for_status()
        root = ET.fromstring(response.content)
        articles = []
        for item in root.findall('.//item')[:12]:
            source = item.find('source')
            title = html.unescape((item.findtext('title') or '').strip())
            description = html.unescape((item.findtext('description') or '').strip())
            description = re.sub(r'<[^>]+>', '', description)
            articles.append({
                'title': title,
                'description': description[:260],
                'url': item.findtext('link'),
                'source': source.text if source is not None else 'Google News',
                'published_at': item.findtext('pubDate'),
            })
        return [article for article in articles if article.get('title')]
    except Exception:
        current_app.logger.warning('Google News RSS fallback failed', exc_info=True)
        return []


def _fallback_news(country):
    location = 'Portugal' if country == 'PT' else 'a tua regiao'
    return [
        {
            'title': f'Radar financeiro em {location}',
            'description': 'Resumo local de inflacao, juros, banca e consumo. Configura FINANCIAL_NEWS_API_KEY para noticias reais em tempo real.',
            'url': None,
            'source': 'Verly',
            'published_at': datetime.utcnow().isoformat(),
        },
        {
            'title': 'Como isto afeta o teu orcamento',
            'description': 'Quando juros ou energia mexem, acompanha renda, transportes, alimentacao e subscricoes no dashboard.',
            'url': None,
            'source': 'Verly',
            'published_at': datetime.utcnow().isoformat(),
        },
    ]
