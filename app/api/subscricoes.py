"""
app/api/subscricoes.py
Endpoint mobile para Leak Detector + verificação Pro via RevenueCat.

Adicionar em app/api/__init__.py:
    from app.api import subscricoes  # noqa
"""

import os
import requests
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Subscricao, User, Fatura
from app import db

# ── Config RevenueCat ─────────────────────────────────────────────────────────

REVENUECAT_SECRET_KEY = os.getenv('REVENUECAT_SECRET_KEY', 'sk_qVKmtGGXRNsBISJeGndavzeKUkFKg')
REVENUECAT_BASE       = 'https://api.revenuecat.com/v2'
PRO_ENTITLEMENT       = 'Verly Pro'


def _is_pro(user_id: int) -> bool:
    """Verifica no RevenueCat se o utilizador tem entitlement Pro ativo."""
    try:
        url = f'{REVENUECAT_BASE}/projects/customers/{user_id}/active_entitlements'
        headers = {
            'Authorization': f'Bearer {REVENUECAT_SECRET_KEY}',
            'Content-Type': 'application/json',
        }
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json()
            entitlements = data.get('items', [])
            return any(e.get('entitlement', {}).get('identifier') == PRO_ENTITLEMENT for e in entitlements)
    except Exception as e:
        print(f'[RevenueCat] Erro ao verificar Pro: {e}')
    return False


# ── GET /api/v1/subscricoes ───────────────────────────────────────────────────

@api_bp.route('/subscricoes', methods=['GET'])
@jwt_required()
def listar_subscricoes():
    """
    Devolve as subscrições do utilizador.
    Se for Pro, inclui análise completa. Se não for, devolve lista limitada.
    """
    user_id = int(get_jwt_identity())

    subs = Subscricao.query.filter_by(user_id=user_id, ativa=True).order_by(
        Subscricao.preco_mensal.desc()
    ).all()

    subs_list = [
        {
            'id':           s.id,
            'nome':         s.nome,
            'categoria':    s.categoria,
            'icone':        s.icone,
            'preco_mensal': s.preco_mensal,
            'meses_pago':   s.meses_pago,
            'risk':         s.risk,
            'fonte':        s.fonte,
        }
        for s in subs
    ]

    total_mensal   = sum(s.preco_mensal for s in subs)
    total_anual    = total_mensal * 12
    total_pago     = sum(s.preco_mensal * s.meses_pago for s in subs)
    high_risk      = [s for s in subs_list if s['risk'] == 'high']

    is_pro = _is_pro(user_id)

    return jsonify({
        'success':      True,
        'is_pro':       is_pro,
        'subscricoes':  subs_list,
        'resumo': {
            'total_mensal':  round(total_mensal, 2),
            'total_anual':   round(total_anual, 2),
            'total_pago':    round(total_pago, 2),
            'count':         len(subs_list),
            'high_risk':     len(high_risk),
        },
    })


# ── POST /api/v1/subscricoes/detetar ─────────────────────────────────────────

SUBSCRIPTION_KEYWORDS = [
    'netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'apple music',
    'youtube premium', 'google one', 'icloud', 'dropbox', 'adobe',
    'microsoft 365', 'microsoft', 'office 365', 'linkedin', 'canva', 'notion',
    'slack', 'zoom', 'gym', 'ginásio', 'fitness', 'nespresso',
    'nos ', 'meo', 'vodafone', 'seguro', 'antivirus', 'vpn',
    'github', 'figma', 'duolingo', 'coursera', 'udemy', 'apple tv',
    'playstation', 'twitch', 'xbox', 'nintendo', 'prime video',
]

SUB_ICONS = {
    'streaming': '📺', 'musica': '🎵', 'cloud': '☁️',
    'fitness': '💪', 'software': '💻', 'telco': '📡',
    'educacao': '📚', 'jogos': '🎮', 'seguro': '🛡️', 'outro': '📦',
}


def _classify(name: str) -> tuple[str, str]:
    n = name.lower()
    if any(k in n for k in ['netflix', 'disney', 'hbo', 'youtube', 'apple tv', 'prime video']):
        cat = 'streaming'
    elif any(k in n for k in ['spotify', 'apple music', 'deezer']):
        cat = 'musica'
    elif any(k in n for k in ['icloud', 'google one', 'dropbox', 'onedrive']):
        cat = 'cloud'
    elif any(k in n for k in ['gym', 'ginásio', 'fitness']):
        cat = 'fitness'
    elif any(k in n for k in ['adobe', 'microsoft', 'github', 'figma', 'notion', 'slack', 'zoom', 'canva']):
        cat = 'software'
    elif any(k in n for k in ['nos ', 'meo', 'vodafone', 'nospresso']):
        cat = 'telco'
    elif any(k in n for k in ['duolingo', 'coursera', 'udemy']):
        cat = 'educacao'
    elif any(k in n for k in ['playstation', 'xbox', 'nintendo', 'twitch']):
        cat = 'jogos'
    elif 'seguro' in n:
        cat = 'seguro'
    else:
        cat = 'outro'
    return cat, SUB_ICONS.get(cat, '📦')


@api_bp.route('/subscricoes/detetar', methods=['POST'])
@jwt_required()
def detetar_subscricoes():
    """
    Analisa as faturas do utilizador e deteta subscrições automáticas.
    Guarda na BD e devolve o resultado.
    Requer Pro para deteção completa (mais de 3 resultados).
    """
    user_id = int(get_jwt_identity())
    is_pro  = _is_pro(user_id)

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    detetadas = {}

    for f in faturas:
        nome = (f.loja or f.nome_ficheiro or '').lower()
        for kw in SUBSCRIPTION_KEYWORDS:
            if kw in nome:
                chave = kw.strip()
                if chave not in detetadas:
                    detetadas[chave] = {
                        'nome':   f.loja or f.nome_ficheiro or kw.title(),
                        'preco':  float(f.total or 0),
                        'count':  1,
                    }
                else:
                    detetadas[chave]['count'] += 1
                    detetadas[chave]['preco'] = max(
                        detetadas[chave]['preco'], float(f.total or 0)
                    )
                break

    # Limitar a 3 para utilizadores Free
    items = list(detetadas.values())
    if not is_pro:
        items = items[:3]

    # Guardar/atualizar na BD
    for item in items:
        nome_display = item['nome'].title()
        cat, icone   = _classify(nome_display)
        preco        = round(item['preco'], 2)
        risk         = 'high' if item['count'] >= 3 else ('medium' if item['count'] == 2 else 'ok')

        existing = Subscricao.query.filter_by(user_id=user_id, nome=nome_display).first()
        if existing:
            existing.preco_mensal = preco
            existing.meses_pago   = item['count']
            existing.risk         = risk
        else:
            db.session.add(Subscricao(
                user_id=user_id,
                nome=nome_display,
                categoria=cat,
                icone=icone,
                preco_mensal=preco,
                meses_pago=item['count'],
                risk=risk,
                fonte='faturas',
            ))

    db.session.commit()

    return jsonify({
        'success':    True,
        'is_pro':     is_pro,
        'detetadas':  len(items),
        'limitado':   not is_pro and len(detetadas) > 3,
    })


# ── DELETE /api/v1/subscricoes/<id> ──────────────────────────────────────────

@api_bp.route('/subscricoes/<int:sub_id>', methods=['DELETE'])
@jwt_required()
def apagar_subscricao(sub_id):
    user_id = int(get_jwt_identity())
    sub = Subscricao.query.filter_by(id=sub_id, user_id=user_id).first()
    if not sub:
        return jsonify({'success': False, 'message': 'Não encontrada'}), 404
    sub.ativa = False
    db.session.commit()
    return jsonify({'success': True})


# ── GET /api/v1/subscricoes/pro-status ───────────────────────────────────────

@api_bp.route('/subscricoes/pro-status', methods=['GET'])
@jwt_required()
def pro_status():
    """Verifica se o utilizador tem Pro ativo via RevenueCat."""
    user_id = int(get_jwt_identity())
    is_pro  = _is_pro(user_id)
    return jsonify({'success': True, 'is_pro': is_pro})