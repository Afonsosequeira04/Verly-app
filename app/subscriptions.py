"""
subscriptions.py — Subscription Leak Detector
Deteta subscrições repetidas nas faturas do user e calcula desperdício mensal.
"""
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta
from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user
from app.models import Fatura

subscriptions_bp = Blueprint('subscriptions', __name__)

# Palavras-chave que indicam subscrição/serviço recorrente
SUBSCRIPTION_KEYWORDS = [
    'netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'apple music',
    'youtube premium', 'google one', 'icloud', 'dropbox', 'adobe',
    'microsoft 365', 'office 365', 'linkedin', 'canva', 'notion',
    'slack', 'zoom', 'gym', 'ginásio', 'fitness', 'health club',
    'nespresso', 'hello fresh', 'deliveroo', 'uber one',
    'tvtel', 'nos', 'meo', 'vodafone', 'deco', 'seguro',
    'antivirus', 'vpn', 'cloudflare', 'github', 'figma',
    'duolingo', 'coursera', 'udemy',
]

# Emojis por categoria de subscrição
SUB_ICONS = {
    'streaming':    '📺',
    'musica':       '🎵',
    'cloud':        '☁️',
    'fitness':      '💪',
    'software':     '💻',
    'alimentacao':  '🍱',
    'telco':        '📡',
    'educacao':     '📚',
    'outro':        '📦',
}

def _classify_sub(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ['netflix','disney','hbo','youtube','tvtel']): return 'streaming'
    if any(k in n for k in ['spotify','apple music','deezer']):           return 'musica'
    if any(k in n for k in ['icloud','google one','dropbox','onedrive']): return 'cloud'
    if any(k in n for k in ['gym','ginásio','fitness','health']):          return 'fitness'
    if any(k in n for k in ['adobe','microsoft','office','figma','canva','antivirus','vpn','github']): return 'software'
    if any(k in n for k in ['hello fresh','nespresso','deliveroo','uber one']): return 'alimentacao'
    if any(k in n for k in ['nos','meo','vodafone','tvtel','nos ']):       return 'telco'
    if any(k in n for k in ['coursera','udemy','duolingo','linkedin']):    return 'educacao'
    return 'outro'


def _is_subscription(loja: str, items_json: str) -> bool:
    text = (loja or '').lower() + ' ' + (items_json or '').lower()
    return any(kw in text for kw in SUBSCRIPTION_KEYWORDS)


def _days_since_last_use(faturas_loja: list) -> int:
    """Calcula quantos dias desde a fatura mais recente desta loja."""
    datas = []
    for f in faturas_loja:
        if f.data_upload:
            datas.append(f.data_upload)
    if not datas:
        return 999
    return (datetime.utcnow() - max(datas)).days


def _risk_level(meses_pago: int, dias_sem_uso: int, total_pago: float) -> str:
    """Determina o nível de risco da subscrição."""
    if dias_sem_uso > 60 or (meses_pago >= 3 and dias_sem_uso > 30):
        return 'danger'   # Cancelar já
    if dias_sem_uso > 30 or meses_pago >= 6:
        return 'warning'  # Suspeito
    return 'ok'           # Vale a pena


def detect_subscriptions(user_id: int) -> dict:
    """
    Analisa as faturas do user e devolve lista de subscrições detetadas
    + resumo de desperdício.
    """
    faturas = Fatura.query.filter_by(user_id=user_id).all()

    # Agrupar faturas por loja
    por_loja = defaultdict(list)
    for f in faturas:
        if f.loja:
            por_loja[f.loja.strip()].append(f)

    subscriptions = []
    total_mensal_desperdicado = 0.0
    total_mensal_ok = 0.0

    for loja, fat_list in por_loja.items():
        # Verificar se parece subscrição
        items_json = fat_list[0].items if fat_list else ''
        if not _is_subscription(loja, items_json):
            continue

        meses_pago = len(fat_list)
        total_pago = sum(f.total or 0 for f in fat_list)
        preco_mensal = total_pago / meses_pago if meses_pago > 0 else 0
        dias_sem_uso = _days_since_last_use(fat_list)
        risk = _risk_level(meses_pago, dias_sem_uso, total_pago)
        categoria_sub = _classify_sub(loja)

        sub = {
            'nome':           loja,
            'icone':          SUB_ICONS.get(categoria_sub, '📦'),
            'categoria':      categoria_sub,
            'meses_pago':     meses_pago,
            'preco_mensal':   round(preco_mensal, 2),
            'total_pago':     round(total_pago, 2),
            'dias_sem_uso':   dias_sem_uso,
            'risk':           risk,
            'risk_label':     {'danger': 'Cancelar já', 'warning': 'Suspeito', 'ok': 'Vale a pena'}[risk],
            'alerta':         _build_alert(loja, meses_pago, dias_sem_uso, risk),
        }
        subscriptions.append(sub)

        if risk == 'danger':
            total_mensal_desperdicado += preco_mensal
        elif risk == 'warning':
            total_mensal_desperdicado += preco_mensal * 0.5
        else:
            total_mensal_ok += preco_mensal

    # Ordenar: danger primeiro, depois warning, depois ok
    order = {'danger': 0, 'warning': 1, 'ok': 2}
    subscriptions.sort(key=lambda s: order[s['risk']])

    return {
        'subscriptions':              subscriptions,
        'total_mensal_desperdicado':  round(total_mensal_desperdicado, 2),
        'total_mensal_ok':            round(total_mensal_ok, 2),
        'total_anual_desperdicado':   round(total_mensal_desperdicado * 12, 2),
        'count_danger':               sum(1 for s in subscriptions if s['risk'] == 'danger'),
        'count_warning':              sum(1 for s in subscriptions if s['risk'] == 'warning'),
        'count_ok':                   sum(1 for s in subscriptions if s['risk'] == 'ok'),
    }


def _build_alert(nome: str, meses: int, dias: int, risk: str) -> str:
    if risk == 'danger' and dias > 60:
        return f'Estás a pagar isto há {meses} meses sem usar há +{dias} dias'
    if risk == 'danger':
        return f'Pagas há {meses} meses — uso muito baixo'
    if risk == 'warning':
        return f'Pagas há {meses} meses — último acesso há {dias} dias'
    return f'Uso regular — {meses} meses activo'


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
