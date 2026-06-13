import json
from collections import defaultdict
from datetime import date, datetime, timedelta

from flask import current_app

from app.financial_records import clean_currency, convert_currency, normalize_text
from app.models import BankTransaction, Fatura, RefundOpportunityState, Subscricao


ACTIVE_STATUSES = {'new', 'draft', 'sent', 'waiting'}
STATUS_LABELS = {
    'new': 'Novo',
    'draft': 'Rascunho',
    'sent': 'Pedido enviado',
    'waiting': 'A espera de resposta',
    'refunded': 'Reembolso recebido',
    'dismissed': 'Ignorado',
}


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(str(value).strip()[:10], fmt).date()
        except ValueError:
            continue
    return None


def _money(value, currency):
    return f'{float(value or 0):.2f} {clean_currency(currency)}'


def _urgency(deadline=None, impact=0):
    if deadline:
        days = (deadline - date.today()).days
        if days <= 1:
            return 'alta'
        if days <= 5:
            return 'media'
    if impact >= 50:
        return 'media'
    return 'info'


def _base_action(kind, merchant, amount, currency, reason, deadline=None):
    deadline_line = f'\nPrazo limite: {deadline.isoformat()}' if deadline else ''
    subject = f'Pedido de analise/reembolso - {merchant}'
    body = (
        f'Bom dia,\n\n'
        f'Gostaria de pedir a vossa analise relativamente a {reason}.\n'
        f'Valor estimado: {_money(amount, currency)}.{deadline_line}\n\n'
        f'Podem confirmar a situacao e indicar o proximo passo para reembolso/compensacao?\n\n'
        f'Obrigado.'
    )
    return {
        'email_subject': subject,
        'email_body': body,
        'support_message': body.replace('Bom dia,\n\n', '').replace('\n\nObrigado.', ''),
        'checklist': [
            'Confirmar a compra/movimento no detalhe',
            'Juntar comprovativo de pagamento',
            'Enviar pedido ao suporte da loja/fornecedor',
            'Guardar numero do pedido ou resposta',
            'Atualizar estado na Verly',
        ],
        'documents': [
            'Fatura ou recibo',
            'Comprovativo bancario',
            'Captura de ecra da condicao/preco/prazo',
        ],
        'kind': kind,
    }


def _price_drop_action(merchant, product_name, paid_price, offer, savings, deadline=None):
    offer_store = offer.get('loja') or 'loja encontrada'
    offer_price = float(offer.get('preco') or 0)
    deadline_line = f'\nPrazo limite: {deadline.isoformat()}' if deadline else ''
    subject = f'Pedido de ajuste de preco - {product_name}'
    body = (
        f'Bom dia,\n\n'
        f'Comprei "{product_name}" em {merchant} por {_money(paid_price, "EUR")}.\n'
        f'Encontrei agora o mesmo produto por {_money(offer_price, "EUR")} em {offer_store}.\n'
        f'Diferenca estimada: {_money(savings, "EUR")}.{deadline_line}\n\n'
        f'Podem confirmar se existe ajuste de preco, reembolso da diferenca ou alternativa de devolucao/recompra?\n\n'
        f'Obrigado.'
    )
    return {
        'email_subject': subject,
        'email_body': body,
        'support_message': body.replace('Bom dia,\n\n', '').replace('\n\nObrigado.', ''),
        'checklist': [
            'Abrir o link/preco encontrado e confirmar que e o mesmo produto',
            'Guardar captura de ecra com preco e data',
            'Confirmar prazo de devolucao ou politica de ajuste de preco',
            'Enviar pedido ao suporte da loja',
            'Atualizar estado na Verly',
        ],
        'documents': [
            'Fatura original',
            'Captura de ecra do preco mais baixo',
            'Link da oferta',
            'Politica de devolucao/price match se existir',
        ],
        'kind': 'price_drop',
        'offer': offer,
    }


def _item_name(item):
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ''
    for key in ('nome', 'name', 'descricao', 'description', 'produto', 'item', 'title'):
        value = item.get(key)
        if value:
            return str(value).strip()
    return ''


def _item_price(item):
    if not isinstance(item, dict):
        return None
    for key in ('total', 'valor', 'preco', 'price', 'amount', 'preco_unitario'):
        value = item.get(key)
        if value in (None, ''):
            continue
        try:
            return float(str(value).replace(',', '.'))
        except (TypeError, ValueError):
            continue
    return None


def _fatura_candidates(fatura):
    try:
        raw_items = json.loads(fatura.items) if fatura.items else []
    except Exception:
        raw_items = []
    if not isinstance(raw_items, list):
        raw_items = []

    candidates = []
    if len(raw_items) == 1:
        name = _item_name(raw_items[0])
        paid = _item_price(raw_items[0]) or float(fatura.total or 0)
        if name and paid > 0:
            candidates.append({'name': name, 'paid': paid})
    else:
        for item in raw_items:
            name = _item_name(item)
            paid = _item_price(item)
            if name and paid and paid > 0:
                candidates.append({'name': name, 'paid': paid})

    if not candidates and fatura.loja and fatura.total and fatura.total >= 20:
        filename_hint = (fatura.nome_ficheiro or '').replace('_', ' ').replace('-', ' ')
        if filename_hint and not filename_hint.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png', '.txt')):
            candidates.append({'name': filename_hint.strip(), 'paid': float(fatura.total or 0)})
    return candidates


def _offer_store_matches(merchant, offer):
    merchant_norm = normalize_text(merchant)
    offer_norm = normalize_text(offer.get('loja') or '')
    return bool(merchant_norm and offer_norm and (merchant_norm in offer_norm or offer_norm in merchant_norm))


def _search_price_offers(product_name, category=''):
    from app.scoring import buscar_precos_online
    from app.extensions import cache

    cache_key = f'refund-price:{normalize_text(product_name)[:80]}:{normalize_text(category)[:40]}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    result = buscar_precos_online(product_name, category, limite=6)
    cache.set(cache_key, result, timeout=6 * 60 * 60)
    return result


def _price_drop_opportunities(user_id, max_checks=None):
    max_checks = max_checks or int(current_app.config.get('REFUND_RADAR_PRICE_CHECK_LIMIT', 4))
    min_savings = float(current_app.config.get('REFUND_RADAR_MIN_PRICE_DROP_EUR', 5))
    min_pct = float(current_app.config.get('REFUND_RADAR_MIN_PRICE_DROP_PCT', 0.08))
    checked = 0
    items = []

    faturas = (
        Fatura.query
        .filter_by(user_id=user_id)
        .order_by(Fatura.data_upload.desc())
        .limit(30)
        .all()
    )
    for fatura in faturas:
        purchase_date = _parse_date(fatura.data_compra) or _parse_date(fatura.data_upload)
        return_deadline = _parse_date(fatura.data_devolucao)
        if return_deadline and return_deadline < date.today():
            continue
        if not return_deadline and purchase_date and (date.today() - purchase_date).days > 30:
            continue
        if not return_deadline and not purchase_date:
            continue

        merchant = fatura.loja or 'loja original'
        for candidate in _fatura_candidates(fatura):
            if checked >= max_checks:
                return items
            product_name = candidate['name']
            paid = float(candidate['paid'] or 0)
            if paid < 15 or len(product_name) < 3:
                continue
            checked += 1
            result = _search_price_offers(product_name, fatura.categoria or '')
            offers = result.get('items') or []
            if not offers:
                continue
            same_store = [offer for offer in offers if _offer_store_matches(merchant, offer)]
            offer = (same_store or offers)[0]
            offer_price = float(offer.get('preco') or 0)
            if offer_price <= 0 or offer_price >= paid:
                continue
            savings = round(paid - offer_price, 2)
            if savings < max(min_savings, paid * min_pct):
                continue

            deadline = return_deadline or (purchase_date + timedelta(days=30) if purchase_date else None)
            match_type = 'same_store' if same_store else 'market'
            title = (
                f'Produto baixou {_money(savings, "EUR")} desde a compra'
                if match_type == 'same_store'
                else f'Preco melhor encontrado - poupas {_money(savings, "EUR")}'
            )
            items.append({
                'key': f'price-drop:fatura:{fatura.id}:{normalize_text(product_name)[:80]}:{round(paid, 2)}',
                'type': 'price_drop',
                'title': title,
                'message': f'{product_name}: pagaste {_money(paid, "EUR")} e encontrei {_money(offer_price, "EUR")} em {offer.get("loja") or "outra loja"}.',
                'amount': savings,
                'currency': 'EUR',
                'deadline': deadline.isoformat() if deadline else None,
                'days_left': (deadline - date.today()).days if deadline else None,
                'urgency': _urgency(deadline, savings),
                'source': {
                    'kind': 'price_source',
                    'provider': 'SerpAPI Google Shopping',
                    'fatura_id': fatura.id,
                    'product_name': product_name,
                    'paid_price': paid,
                    'offer': offer,
                    'match_type': match_type,
                    'configured': bool(result.get('configured')),
                },
                'action': _price_drop_action(merchant, product_name, paid, offer, savings, deadline),
            })
    return items


def _state_map(user_id):
    states = RefundOpportunityState.query.filter_by(user_id=user_id).all()
    return {state.opportunity_key: state for state in states}


def _apply_state(items, states, currency):
    merged = []
    for item in items:
        state = states.get(item['key'])
        item['status'] = state.status if state else 'new'
        item['status_label'] = STATUS_LABELS.get(item['status'], item['status'])
        item['notes'] = state.notes if state else None
        item['recovered_amount'] = round(float(state.recovered_amount or 0), 2) if state else 0
        item['state_id'] = state.id if state else None
        converted, converted_flag = convert_currency(item.get('amount') or 0, item.get('currency'), currency)
        item['display_amount'] = round(converted, 2)
        item['display_currency'] = currency
        item['converted'] = converted_flag
        if item['status'] != 'dismissed':
            merged.append(item)
    order = {'alta': 0, 'media': 1, 'info': 2}
    merged.sort(key=lambda x: (order.get(x.get('urgency'), 9), x.get('deadline') or '9999-12-31', -x.get('display_amount', 0)))
    return merged


def _return_opportunities(user_id):
    items = []
    for fatura in Fatura.query.filter_by(user_id=user_id).all():
        due = _parse_date(fatura.data_devolucao)
        if not due:
            continue
        days = (due - date.today()).days
        if days < 0 or days > 7:
            continue
        amount = float(fatura.total or 0)
        merchant = fatura.loja or fatura.nome_ficheiro or 'loja'
        title = (
            f'Prazo de devolucao termina amanha - compra {_money(amount, "EUR")}'
            if days == 1
            else f'Prazo de devolucao termina em {days} dias - {_money(amount, "EUR")}'
        )
        reason = f'prazo de devolucao da compra em {merchant}'
        items.append({
            'key': f'return:fatura:{fatura.id}',
            'type': 'return_deadline',
            'title': title,
            'message': f'{merchant}: ainda podes agir ate {due.strftime("%d/%m/%Y")}.',
            'amount': amount,
            'currency': 'EUR',
            'deadline': due.isoformat(),
            'days_left': days,
            'urgency': _urgency(due, amount),
            'source': {'kind': 'fatura', 'id': fatura.id},
            'action': _base_action('return', merchant, amount, 'EUR', reason, due),
        })
    return items


def _warranty_opportunities(user_id):
    items = []
    for fatura in Fatura.query.filter_by(user_id=user_id).all():
        due = _parse_date(fatura.data_garantia)
        if not due:
            continue
        days = (due - date.today()).days
        if days < 0 or days > 14:
            continue
        amount = float(fatura.total or 0)
        merchant = fatura.loja or fatura.nome_ficheiro or 'loja'
        reason = f'garantia a terminar para a compra em {merchant}'
        items.append({
            'key': f'warranty:fatura:{fatura.id}',
            'type': 'warranty_deadline',
            'title': f'Garantia expira em {days} dias - {merchant}',
            'message': 'Se o produto tem algum problema, este e o momento de abrir pedido.',
            'amount': amount,
            'currency': 'EUR',
            'deadline': due.isoformat(),
            'days_left': days,
            'urgency': _urgency(due, amount),
            'source': {'kind': 'fatura', 'id': fatura.id},
            'action': _base_action('warranty', merchant, amount, 'EUR', reason, due),
        })
    return items


def _duplicate_charge_opportunities(user_id):
    transactions = BankTransaction.query.filter(
        BankTransaction.user_id == user_id,
        BankTransaction.amount < 0,
    ).all()
    grouped = defaultdict(list)
    for tx in transactions:
        tx_date = tx.booked_at or tx.value_date
        merchant = normalize_text(tx.merchant_name or tx.description or '')
        if not tx_date or not merchant:
            continue
        amount = round(abs(float(tx.amount or 0)), 2)
        key = (tx_date.isoformat(), merchant, amount, clean_currency(tx.currency))
        grouped[key].append(tx)

    items = []
    for (tx_date, merchant_key, amount, currency), txs in grouped.items():
        if len(txs) < 2:
            continue
        display = txs[0].merchant_name or txs[0].description or merchant_key.title()
        duplicate_amount = amount * (len(txs) - 1)
        reason = f'possivel cobranca duplicada em {display} no dia {tx_date}'
        items.append({
            'key': f'duplicate:{tx_date}:{merchant_key}:{amount}:{currency}',
            'type': 'duplicate_charge',
            'title': f'Possivel cobranca duplicada - {_money(duplicate_amount, currency)}',
            'message': f'{display} aparece {len(txs)} vezes no mesmo dia com o mesmo valor.',
            'amount': duplicate_amount,
            'currency': currency,
            'deadline': None,
            'days_left': None,
            'urgency': 'alta',
            'source': {'kind': 'open_banking', 'transaction_ids': [tx.id for tx in txs]},
            'action': _base_action('duplicate_charge', display, duplicate_amount, currency, reason),
        })
    return items


def _next_monthly_date(start):
    if not start:
        return None
    today = date.today()
    day = min(start.day, 28)
    candidate = date(today.year, today.month, day)
    if candidate < today:
        if today.month == 12:
            candidate = date(today.year + 1, 1, day)
        else:
            candidate = date(today.year, today.month + 1, day)
    return candidate


def _subscription_opportunities(user_id):
    items = []
    for sub in Subscricao.query.filter_by(user_id=user_id, ativa=True).all():
        next_date = _next_monthly_date((sub.atualizado_em or sub.criado_em or datetime.utcnow()).date())
        if not next_date:
            continue
        days = (next_date - date.today()).days
        if days < 0 or days > 3:
            continue
        amount = float(sub.preco_mensal or 0)
        currency = 'EUR'
        reason = f'renovacao da subscricao {sub.nome}'
        items.append({
            'key': f'subscription:renewal:{sub.id}:{next_date.isoformat()}',
            'type': 'subscription_renewal',
            'title': f'Subscricao renova em {days} dias - {_money(amount, currency)}',
            'message': f'{sub.nome} parece renovar em breve. Cancela antes se ja nao usas.',
            'amount': amount,
            'currency': currency,
            'deadline': next_date.isoformat(),
            'days_left': days,
            'urgency': 'media' if days > 1 else 'alta',
            'source': {'kind': 'subscricao', 'id': sub.id},
            'action': _base_action('subscription_cancel', sub.nome, amount, currency, reason, next_date),
        })
    return items


def _group_debt_opportunities(user_id):
    try:
        from app.models_social import DespesaGrupo, Grupo, grupo_membro
    except Exception:
        return []

    grupos = (
        Grupo.query
        .join(grupo_membro, Grupo.id == grupo_membro.c.grupo_id)
        .filter(grupo_membro.c.user_id == user_id, Grupo.ativo == True)
        .all()
    )
    items = []
    for grupo in grupos:
        saldos = {
            member.id: {'nome': member.nome, 'pago': 0.0, 'parte': 0.0}
            for member in grupo.membros.all()
        }
        despesas = DespesaGrupo.query.filter_by(grupo_id=grupo.id, ativo=True).all()
        for despesa in despesas:
            if despesa.pagador_id in saldos:
                saldos[despesa.pagador_id]['pago'] += float(despesa.valor or 0)
            for parte in despesa.participantes.all():
                if parte.user_id in saldos:
                    saldos[parte.user_id]['parte'] += float(parte.valor or 0)
        balances = [
            {'user_id': uid, 'nome': item['nome'], 'saldo': round(item['pago'] - item['parte'], 2)}
            for uid, item in saldos.items()
        ]
        my_balance = next((item['saldo'] for item in balances if item['user_id'] == user_id), 0)
        if my_balance <= 0.01:
            continue
        debtors = [item for item in balances if item['saldo'] < -0.01]
        remaining = my_balance
        for debtor in sorted(debtors, key=lambda x: x['saldo']):
            amount = min(abs(debtor['saldo']), remaining)
            if amount <= 0.01:
                continue
            remaining = round(remaining - amount, 2)
            items.append({
                'key': f'group-debt:{grupo.id}:{debtor["user_id"]}:{round(amount, 2)}',
                'type': 'group_debt',
                'title': f'{debtor["nome"]} ainda te deve {_money(amount, "EUR")}',
                'message': f'Acerto pendente no grupo {grupo.nome}.',
                'amount': amount,
                'currency': 'EUR',
                'deadline': None,
                'days_left': None,
                'urgency': 'info',
                'source': {'kind': 'grupo', 'id': grupo.id, 'debtor_id': debtor['user_id']},
                'action': {
                    **_base_action('group_debt', debtor['nome'], amount, 'EUR', f'acerto pendente no grupo {grupo.nome}'),
                    'support_message': f'Ola {debtor["nome"]}, podes enviar-me {_money(amount, "EUR")} do acerto do grupo {grupo.nome}?',
                    'checklist': ['Confirmar saldo no grupo', 'Enviar mensagem ao membro', 'Marcar como recebido quando entrar'],
                    'documents': ['Resumo do grupo', 'Comprovativo da despesa se necessario'],
                },
            })
            if remaining <= 0.01:
                break
    return items


def detect_refund_opportunities(user_id, currency='EUR', include_resolved=False):
    display_currency = clean_currency(currency)
    raw_items = []
    raw_items.extend(_return_opportunities(user_id))
    raw_items.extend(_warranty_opportunities(user_id))
    raw_items.extend(_duplicate_charge_opportunities(user_id))
    raw_items.extend(_subscription_opportunities(user_id))
    raw_items.extend(_group_debt_opportunities(user_id))
    raw_items.extend(_price_drop_opportunities(user_id))

    items = _apply_state(raw_items, _state_map(user_id), display_currency)
    if not include_resolved:
        items = [item for item in items if item['status'] in ACTIVE_STATUSES]
    total = sum(item.get('display_amount') or 0 for item in items if item['type'] != 'warranty_deadline')
    return {
        'currency': display_currency,
        'total_potential': round(total, 2),
        'count': len(items),
        'urgent_count': sum(1 for item in items if item.get('urgency') == 'alta'),
        'opportunities': items,
    }


def refund_notifications(user_id, limit=5):
    data = detect_refund_opportunities(user_id)
    notifications = []
    for item in data['opportunities'][:limit]:
        notifications.append({
            'tipo': f'refund_{item["type"]}',
            'titulo': item['title'],
            'mensagem': item['message'],
            'icone': '$',
            'urgencia': item.get('urgency', 'info'),
            'link': '/refund-radar',
            'action_route': 'RefundRadar',
            'refund_key': item['key'],
        })
    return notifications
