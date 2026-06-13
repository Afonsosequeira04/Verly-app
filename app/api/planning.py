from datetime import date, datetime, timedelta
from urllib.parse import quote

import requests
from flask import Response, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.api import api_bp
from app.financial_records import clean_currency, convert_currency, summarize_expenses
from app.models import Bill, CalendarConnection, FamilyPlan, User, family_member


LANGUAGES = {'pt', 'en', 'es', 'fr', 'de', 'it'}
CURRENCIES = {'EUR', 'USD', 'GBP', 'DKK', 'SEK', 'NOK'}
RECURRENCES = {'none', 'monthly', 'quarterly', 'yearly'}


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


def _family_to_dict(family, display_currency='EUR'):
    member_ids = [member.id for member in family.membros.all()]
    summaries = []
    total = 0
    for member in family.membros.all():
        summary = summarize_expenses(member.id, currency=display_currency)
        spent = summary['mes_atual']['total']
        total += spent
        summaries.append({
            'id': member.id,
            'nome': member.nome,
            'email': member.email,
            'gasto_mes': round(spent, 2),
            'currency': display_currency,
        })
    budget, _ = convert_currency(family.orcamento_mensal, family.currency, display_currency)
    return {
        'id': family.id,
        'nome': family.nome,
        'owner_id': family.owner_id,
        'orcamento_mensal': round(budget, 2),
        'currency': display_currency,
        'membros': summaries,
        'member_ids': member_ids,
        'total_gasto_mes': round(total, 2),
        'sobra': round(budget - total, 2),
        'pct_orcamento': round((total / budget) * 100, 1) if budget > 0 else None,
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


@api_bp.route('/familia', methods=['GET', 'POST'])
@jwt_required()
def familia():
    user_id = _user_id()
    user = User.query.get_or_404(user_id)
    display_currency = clean_currency(request.args.get('currency') or getattr(user, 'moeda_preferida', 'EUR'))

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        family = FamilyPlan(
            nome=(data.get('nome') or f'Familia de {user.nome}').strip()[:120],
            owner_id=user_id,
            orcamento_mensal=max(0, float(data.get('orcamento_mensal') or 0)),
            currency=clean_currency(data.get('currency') or display_currency),
        )
        db.session.add(family)
        db.session.flush()
        db.session.execute(family_member.insert().values(family_id=family.id, user_id=user_id, role='owner'))
        db.session.commit()
        return jsonify({'family': _family_to_dict(family, display_currency)}), 201

    family = (
        FamilyPlan.query
        .join(family_member, FamilyPlan.id == family_member.c.family_id)
        .filter(family_member.c.user_id == user_id, FamilyPlan.ativo == True)
        .first()
    )
    return jsonify({'family': _family_to_dict(family, display_currency) if family else None})


@api_bp.route('/familia/invite', methods=['POST'])
@jwt_required()
def familia_invite():
    user_id = _user_id()
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    target = User.query.filter(db.func.lower(User.email) == email).first() if email else None
    if not target:
        return jsonify({'error': 'Utilizador nao encontrado.'}), 404
    family = FamilyPlan.query.filter_by(owner_id=user_id, ativo=True).first()
    if not family:
        return jsonify({'error': 'Cria primeiro um plano familiar.'}), 400
    exists = db.session.execute(
        family_member.select().where(
            family_member.c.family_id == family.id,
            family_member.c.user_id == target.id,
        )
    ).fetchone()
    if not exists:
        db.session.execute(family_member.insert().values(family_id=family.id, user_id=target.id, role='member'))
        db.session.commit()
    return jsonify({'family': _family_to_dict(family, request.args.get('currency') or family.currency)})


@api_bp.route('/discover/news', methods=['GET'])
@jwt_required()
def discover_news():
    country = (request.args.get('country') or 'PT').strip().upper()[:2]
    language = (request.args.get('language') or 'pt').strip().lower()[:2]
    query = request.args.get('q') or 'personal finance economy inflation banking'
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

    fallback = _fallback_news(country)
    return jsonify({'country': country, 'language': language, 'source': 'fallback', 'articles': fallback})


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
