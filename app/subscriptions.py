"""
subscriptions.py — Subscription Leak Detector
Deteta subscrições repetidas nas faturas do user e calcula desperdício mensal.
Também aceita upload de extratos bancários (TXT/CSV) para deteção automática.
Guarda tudo na BD para persistência entre sessões.
"""
import re
from collections import defaultdict
from datetime import datetime
from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from app.financial_records import clean_currency, normalize_text
from app.models import BankTransaction, Fatura, Subscricao
from app import db

subscriptions_bp = Blueprint('subscriptions', __name__)

# Palavras-chave que indicam subscrição/serviço recorrente
SUBSCRIPTION_KEYWORDS = [
    'netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'apple music',
    'youtube premium', 'google one', 'icloud', 'dropbox', 'adobe',
    'microsoft 365', 'microsoft', 'office 365', 'linkedin', 'canva', 'notion',
    'slack', 'zoom', 'gym', 'ginásio', 'fitness', 'health club',
    'nespresso', 'hello fresh', 'deliveroo', 'uber one',
    'tvtel', 'nos ', 'nos\t', 'meo', 'vodafone', 'deco', 'seguro',
    'antivirus', 'vpn', 'cloudflare', 'github', 'figma',
    'duolingo', 'coursera', 'udemy', 'apple tv', 'playstation',
    'twitch', 'xbox', 'nintendo', 'adobe creative', 'nos comunicacoes',
    'youtube', 'prime video',
]

SUB_ICONS = {
    'streaming':    '📺',
    'musica':       '🎵',
    'cloud':        '☁️',
    'fitness':      '💪',
    'software':     '💻',
    'alimentacao':  '🍱',
    'telco':        '📡',
    'educacao':     '📚',
    'jogos':        '🎮',
    'seguro':       '🛡️',
    'outro':        '📦',
}


def _classify_sub(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ['netflix', 'disney', 'hbo', 'youtube', 'tvtel', 'apple tv', 'prime video']): return 'streaming'
    if any(k in n for k in ['spotify', 'apple music', 'deezer', 'tidal']):                               return 'musica'
    if any(k in n for k in ['icloud', 'google one', 'dropbox', 'onedrive']):                             return 'cloud'
    if any(k in n for k in ['gym', 'ginásio', 'fitness', 'health']):                                     return 'fitness'
    if any(k in n for k in ['adobe', 'microsoft', 'office', 'figma', 'canva', 'antivirus', 'vpn', 'github', 'notion', 'slack', 'zoom']): return 'software'
    if any(k in n for k in ['hello fresh', 'nespresso', 'deliveroo', 'uber one']):                       return 'alimentacao'
    if any(k in n for k in ['nos', 'meo', 'vodafone', 'nowo', 'digi']):                                  return 'telco'
    if any(k in n for k in ['coursera', 'udemy', 'duolingo', 'linkedin']):                               return 'educacao'
    if any(k in n for k in ['playstation', 'xbox', 'nintendo', 'twitch', 'steam', 'ea play']):           return 'jogos'
    if any(k in n for k in ['seguro', 'fidelidade', 'allianz', 'ageas', 'ok teleseguros']):              return 'seguro'
    return 'outro'


def _is_subscription(text: str) -> bool:
    t = (text or '').lower()
    return any(kw in t for kw in SUBSCRIPTION_KEYWORDS)


def _days_since_last_use(faturas_loja: list) -> int:
    datas = [f.data_upload for f in faturas_loja if f.data_upload]
    if not datas:
        return 999
    return (datetime.utcnow() - max(datas)).days


def _risk_level(meses_pago: int, dias_sem_uso: int, total_pago: float) -> str:
    if dias_sem_uso > 60 or (meses_pago >= 3 and dias_sem_uso > 30):
        return 'danger'
    if dias_sem_uso > 30 or meses_pago >= 6:
        return 'warning'
    return 'ok'


def _build_alert(nome: str, meses: int, dias: int, risk: str) -> str:
    if risk == 'danger' and dias > 60:
        return f'Estás a pagar isto há {meses} meses sem usar há +{dias} dias'
    if risk == 'danger':
        return f'Pagas há {meses} meses — uso muito baixo'
    if risk == 'warning':
        return f'Pagas há {meses} meses — último acesso há {dias} dias'
    return f'Uso regular — {meses} meses activo'


def _parse_extrato(texto: str) -> list:
    """
    Lê um extrato bancário em TXT ou CSV e devolve lista de movimentos.
    """
    movimentos = []
    padroes = [
        r'(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+([-+][\d\s\.,]+)',
        r'(\d{4}[\/\-]\d{2}[\/\-]\d{2})\s+(.+?)\s+([-+][\d\s\.,]+)',
    ]

    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha or len(linha) < 10:
            continue

        for padrao in padroes:
            m = re.match(padrao, linha)
            if m:
                descricao = m.group(2).strip()
                valor_str = m.group(3).replace(' ', '').replace(',', '.')
                try:
                    valor = float(valor_str)
                except ValueError:
                    continue

                movimentos.append({
                    'data': m.group(1),
                    'descricao': descricao,
                    'valor': valor,
                })
                break

    return movimentos


def _detetar_subscricoes_extrato(movimentos: list) -> dict:
    """
    A partir de uma lista de movimentos, deteta subscrições recorrentes.
    """
    por_nome = defaultdict(list)
    for mov in movimentos:
        if mov['valor'] >= 0:
            continue
        desc = mov['descricao'].strip()
        if _is_subscription(desc):
            por_nome[desc].append(mov)

    todos_debitos = defaultdict(list)
    for mov in movimentos:
        if mov['valor'] < 0:
            chave = re.sub(r'\s+', ' ', mov['descricao'].lower().strip())
            todos_debitos[chave].append(mov)

    for chave, movs in todos_debitos.items():
        if len(movs) >= 2 and chave not in [k.lower() for k in por_nome]:
            por_nome[movs[0]['descricao']].extend(movs)

    subscriptions = []
    total_mensal = 0.0

    for nome, movs in por_nome.items():
        valores = [abs(m['valor']) for m in movs]
        preco_mensal = sum(valores) / len(valores)
        meses_pago = len(movs)
        recorrente = meses_pago >= 2
        risk = 'danger' if meses_pago >= 3 else ('warning' if recorrente else 'ok')
        categoria_sub = _classify_sub(nome)

        sub = {
            'nome':         nome,
            'icone':        SUB_ICONS.get(categoria_sub, '📦'),
            'categoria':    categoria_sub,
            'meses_pago':   meses_pago,
            'currency':     'EUR',
            'preco_mensal': round(preco_mensal, 2),
            'total_pago':   round(sum(valores), 2),
            'dias_sem_uso': 0,
            'risk':         risk,
            'risk_label':   {'danger': 'Recorrente', 'warning': 'Suspeito', 'ok': 'Este mês'}[risk],
            'alerta':       f'Encontrado {meses_pago}x no extrato — {preco_mensal:.2f}€/mês',
            'fonte':        'extrato',
        }
        subscriptions.append(sub)
        total_mensal += preco_mensal

    order = {'danger': 0, 'warning': 1, 'ok': 2}
    subscriptions.sort(key=lambda s: order[s['risk']])

    return {
        'subscriptions':             subscriptions,
        'total_mensal_desperdicado': round(total_mensal, 2),
        'total_mensal_ok':           0.0,
        'total_anual_desperdicado':  round(total_mensal * 12, 2),
        'count_danger':              sum(1 for s in subscriptions if s['risk'] == 'danger'),
        'count_warning':             sum(1 for s in subscriptions if s['risk'] == 'warning'),
        'count_ok':                  sum(1 for s in subscriptions if s['risk'] == 'ok'),
        'total_movimentos':          len(movimentos),
    }


def _guardar_subscricoes_bd(user_id: int, subscriptions: list, fonte: str = 'extrato'):
    """
    Guarda/actualiza subscrições na BD.
    Se já existir uma com o mesmo nome, actualiza — se não, cria nova.
    """
    for sub in subscriptions:
        existente = Subscricao.query.filter_by(
            user_id=user_id,
            nome=sub['nome']
        ).first()

        if existente:
            existente.preco_mensal = sub['preco_mensal']
            existente.meses_pago = sub['meses_pago']
            existente.risk = sub['risk']
            existente.categoria = sub['categoria']
            existente.icone = sub['icone']
            existente.fonte = fonte
            existente.ativa = True
            existente.atualizado_em = datetime.utcnow()
        else:
            nova = Subscricao(
                user_id=user_id,
                nome=sub['nome'],
                categoria=sub['categoria'],
                icone=sub['icone'],
                preco_mensal=sub['preco_mensal'],
                meses_pago=sub['meses_pago'],
                risk=sub['risk'],
                fonte=fonte,
                ativa=True,
            )
            db.session.add(nova)

    db.session.commit()


def _bank_transaction_date(transaction):
    return transaction.booked_at or transaction.value_date


def _bank_subscription_key(transaction):
    text = transaction.merchant_name or transaction.description or ''
    normalized = normalize_text(text)
    normalized = re.sub(r'\b\d{2,}\b', ' ', normalized)
    normalized = re.sub(r'\b(ref|id|seq|aut|pagamento|compra|cartao|mbway|sepa)\b', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    if len(normalized) < 3:
        return None
    return normalized


def _amounts_are_recurring(values):
    if len(values) < 2:
        return False
    avg = sum(values) / len(values)
    tolerance = max(avg * 0.30, 2.0)
    return max(values) - min(values) <= tolerance


def _detetar_subscricoes_banco(user_id: int) -> list:
    transactions = BankTransaction.query.filter(
        BankTransaction.user_id == user_id,
        BankTransaction.amount < 0,
    ).all()

    grouped = defaultdict(list)
    display_names = {}
    currencies = {}
    for transaction in transactions:
        tx_date = _bank_transaction_date(transaction)
        base_key = _bank_subscription_key(transaction)
        if not base_key or not tx_date:
            continue
        currency = clean_currency(transaction.currency)
        key = f'{base_key}:{currency}'
        grouped[key].append(transaction)
        currencies[key] = currency
        display_names.setdefault(
            key,
            transaction.merchant_name or transaction.description or key.title(),
        )

    subscriptions = []
    for key, txs in grouped.items():
        months = {
            f'{_bank_transaction_date(tx).year}-{_bank_transaction_date(tx).month:02d}'
            for tx in txs
            if _bank_transaction_date(tx)
        }
        if len(months) < 2:
            continue

        values = [abs(float(tx.amount or 0)) for tx in txs if tx.amount]
        name = display_names.get(key, key.title())
        currency = currencies.get(key, 'EUR')
        known_subscription = _is_subscription(f'{key} {name}')
        if not known_subscription and not _amounts_are_recurring(values):
            continue

        preco_mensal = sum(values) / len(values) if values else 0
        if preco_mensal <= 0:
            continue

        categoria_sub = _classify_sub(name)
        meses_pago = len(months)
        risk = 'danger' if meses_pago >= 3 else 'warning'
        subscriptions.append({
            'nome': name[:200],
            'icone': SUB_ICONS.get(categoria_sub, 'ðŸ“¦'),
            'categoria': categoria_sub,
            'meses_pago': meses_pago,
            'currency': currency,
            'preco_mensal': round(preco_mensal, 2),
            'total_pago': round(sum(values), 2),
            'dias_sem_uso': 0,
            'risk': risk,
            'risk_label': {'danger': 'Recorrente', 'warning': 'Suspeito'}[risk],
            'alerta': f'{meses_pago} meses detectados no banco - {preco_mensal:.2f} {currency}/mes',
            'fonte': 'open_banking',
        })

    order = {'danger': 0, 'warning': 1, 'ok': 2}
    subscriptions.sort(key=lambda s: (order.get(s['risk'], 3), -s['preco_mensal']))
    return subscriptions


def sync_bank_subscriptions(user_id: int) -> int:
    subscriptions = _detetar_subscricoes_banco(user_id)
    if subscriptions:
        _guardar_subscricoes_bd(user_id, subscriptions, fonte='open_banking')
    return len(subscriptions)


def detect_subscriptions(user_id: int) -> dict:
    """
    Devolve subscrições combinadas: da BD (extrato+manual) + detetadas nas faturas.
    """
    # 1. Subscrições guardadas na BD (de extratos anteriores)
    subs_bd = Subscricao.query.filter_by(user_id=user_id, ativa=True).all()
    nomes_bd = {s.nome.lower() for s in subs_bd}

    subscriptions = []
    for s in subs_bd:
        subscriptions.append({
            'nome':         s.nome,
            'icone':        s.icone or '📦',
            'categoria':    s.categoria,
            'meses_pago':   s.meses_pago,
            'preco_mensal': s.preco_mensal,
            'total_pago':   round(s.preco_mensal * s.meses_pago, 2),
            'dias_sem_uso': 0,
            'risk':         s.risk,
            'risk_label':   {'danger': 'Recorrente', 'warning': 'Suspeito', 'ok': 'Este mês'}.get(s.risk, 'Ok'),
            'alerta':       f'{s.meses_pago}x detectado — {s.preco_mensal:.2f}€/mês',
            'fonte':        s.fonte,
            'db_id':        s.id,
        })

    # 2. Subscrições das faturas (que não estejam já na BD)
    faturas = Fatura.query.filter_by(user_id=user_id).all()
    por_loja = defaultdict(list)
    for f in faturas:
        if f.loja:
            por_loja[f.loja.strip()].append(f)

    for loja, fat_list in por_loja.items():
        if loja.lower() in nomes_bd:
            continue
        items_json = fat_list[0].items if fat_list else ''
        if not _is_subscription(loja + ' ' + (items_json or '')):
            continue

        meses_pago = len(fat_list)
        total_pago = sum(f.total or 0 for f in fat_list)
        preco_mensal = total_pago / meses_pago if meses_pago > 0 else 0
        dias_sem_uso = _days_since_last_use(fat_list)
        risk = _risk_level(meses_pago, dias_sem_uso, total_pago)
        categoria_sub = _classify_sub(loja)

        subscriptions.append({
            'nome':         loja,
            'icone':        SUB_ICONS.get(categoria_sub, '📦'),
            'categoria':    categoria_sub,
            'meses_pago':   meses_pago,
            'preco_mensal': round(preco_mensal, 2),
            'total_pago':   round(total_pago, 2),
            'dias_sem_uso': dias_sem_uso,
            'risk':         risk,
            'risk_label':   {'danger': 'Cancelar já', 'warning': 'Suspeito', 'ok': 'Vale a pena'}[risk],
            'alerta':       _build_alert(loja, meses_pago, dias_sem_uso, risk),
            'fonte':        'faturas',
        })

    nomes_existentes = {normalize_text(s['nome']) for s in subscriptions}
    for sub in _detetar_subscricoes_banco(user_id):
        if normalize_text(sub['nome']) in nomes_existentes:
            continue
        subscriptions.append(sub)
        nomes_existentes.add(normalize_text(sub['nome']))

    order = {'danger': 0, 'warning': 1, 'ok': 2}
    subscriptions.sort(key=lambda s: order[s['risk']])

    total_mensal_desperdicado = 0.0
    total_mensal_ok = 0.0
    totais_por_moeda = defaultdict(lambda: {'desperdicado': 0.0, 'ok': 0.0})
    for s in subscriptions:
        currency = clean_currency(s.get('currency'))
        if s['risk'] == 'danger':
            total_mensal_desperdicado += s['preco_mensal']
            totais_por_moeda[currency]['desperdicado'] += s['preco_mensal']
        elif s['risk'] == 'warning':
            total_mensal_desperdicado += s['preco_mensal'] * 0.5
            totais_por_moeda[currency]['desperdicado'] += s['preco_mensal'] * 0.5
        else:
            total_mensal_ok += s['preco_mensal']
            totais_por_moeda[currency]['ok'] += s['preco_mensal']

    return {
        'subscriptions':             subscriptions,
        'total_mensal_desperdicado': round(total_mensal_desperdicado, 2),
        'total_mensal_ok':           round(total_mensal_ok, 2),
        'total_anual_desperdicado':  round(total_mensal_desperdicado * 12, 2),
        'totais_por_moeda': [
            {
                'currency': currency,
                'desperdicado': round(values['desperdicado'], 2),
                'ok': round(values['ok'], 2),
            }
            for currency, values in sorted(totais_por_moeda.items())
        ],
        'count_danger':              sum(1 for s in subscriptions if s['risk'] == 'danger'),
        'count_warning':             sum(1 for s in subscriptions if s['risk'] == 'warning'),
        'count_ok':                  sum(1 for s in subscriptions if s['risk'] == 'ok'),
    }


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@subscriptions_bp.route('/subscriptions')
@login_required
def subscriptions():
    data = detect_subscriptions(current_user.id)
    return render_template('subscriptions.html', **data)


@subscriptions_bp.route('/subscriptions/api')
@login_required
def subscriptions_api():
    data = detect_subscriptions(current_user.id)
    return jsonify({'success': True, **data})


@subscriptions_bp.route('/subscriptions/analisar-extrato', methods=['POST'])
@login_required
def analisar_extrato():
    """Recebe um ficheiro TXT/CSV de extrato bancário e deteta subscrições."""
    if 'extrato' not in request.files:
        return jsonify({'error': 'Nenhum ficheiro enviado'}), 400

    ficheiro = request.files['extrato']
    if not ficheiro.filename:
        return jsonify({'error': 'Ficheiro inválido'}), 400

    try:
        conteudo = ficheiro.read().decode('utf-8')
    except UnicodeDecodeError:
        ficheiro.seek(0)
        conteudo = ficheiro.read().decode('latin-1')

    movimentos = _parse_extrato(conteudo)
    if not movimentos:
        return jsonify({'error': 'Não foi possível ler movimentos do ficheiro. Certifica-te que é um extrato em TXT ou CSV.'}), 400

    resultado = _detetar_subscricoes_extrato(movimentos)

    # Guardar na BD para persistir entre sessões
    _guardar_subscricoes_bd(current_user.id, resultado['subscriptions'], fonte='extrato')

    return jsonify({'success': True, **resultado})


@subscriptions_bp.route('/subscriptions/cancelar/<int:sub_id>', methods=['POST'])
@login_required
def cancelar_subscricao(sub_id):
    """Marca uma subscrição como inativa (cancelada pelo user)."""
    sub = Subscricao.query.filter_by(id=sub_id, user_id=current_user.id).first_or_404()
    sub.ativa = False
    db.session.commit()
    return jsonify({'success': True})


@subscriptions_bp.route('/subscriptions/manual', methods=['POST'])
@login_required
def adicionar_manual():
    """Adiciona uma subscrição manualmente."""
    data = request.get_json() or {}
    nome = (data.get('nome') or '').strip()
    preco = float(data.get('preco_mensal') or 0)
    if not nome or preco <= 0:
        return jsonify({'error': 'Nome e preço são obrigatórios'}), 400

    categoria = _classify_sub(nome)
    sub = Subscricao(
        user_id=current_user.id,
        nome=nome,
        categoria=categoria,
        icone=SUB_ICONS.get(categoria, '📦'),
        preco_mensal=preco,
        meses_pago=1,
        risk='ok',
        fonte='manual',
        ativa=True,
    )
    db.session.add(sub)
    db.session.commit()
    return jsonify({'success': True, 'id': sub.id})
