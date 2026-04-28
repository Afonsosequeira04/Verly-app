"""
scoring.py — "Was It Worth It?" AI Scoring
Devolve um score 0-100 por compra com label e justificação.
"""
import json
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from app.models import Fatura
from app import db

scoring_bp = Blueprint('scoring', __name__)

# Pesos por categoria (quanto a categoria "justifica" o gasto)
CATEGORY_WEIGHTS = {
    'Alimentação':      1.15,
    'Saúde & Beleza':   1.10,
    'Educação':         1.10,
    'Desporto':         1.05,
    'Casa & Decoração': 1.00,
    'Vestuário':        0.95,
    'Tecnologia':       0.90,
    'Entretenimento':   0.85,
    'Transportes':      1.00,
    'Outros':           0.90,
}

# Penalidade por preço (compras maiores = mais escrutínio)
def _price_penalty(price: float) -> float:
    if price > 1000: return -20
    if price > 500:  return -12
    if price > 200:  return -6
    if price > 100:  return -3
    return 0

# Score base por frequência de uso declarada
USAGE_BASE = {
    'daily':   80,
    'weekly':  65,
    'monthly': 45,
    'rarely':  22,
    'never':   5,
}

USAGE_LABELS = {
    'daily':   'Uso diário',
    'weekly':  'Uso regular',
    'monthly': 'Uso ocasional',
    'rarely':  'Raramente usado',
    'never':   'Nunca utilizado',
}

def _score_label(score: int, personalidade: str) -> dict:
    """Devolve label, cor CSS e mensagem baseados no score e personalidade do user."""

    personas = {
        'savage': {
            (80, 101): ('Decisão Sólida',   'green',  'Raro. Até tu fizeste bem desta vez.'),
            (60,  80): ('Aceitável',         'brand2', 'Passável. Mas não te gabares.'),
            (40,  60): ('Duvidoso',          'yellow', 'Sabes que não precisavas disto.'),
            (20,  40): ('Regret Incoming',   'orange', 'O teu futuro eu vai mandar-te mensagens de ódio.'),
            (0,   20): ('Dinheiro Ardido',   'red',    'Parabéns. Transformaste euros em remorso puro.'),
        },
        'sarcastic': {
            (80, 101): ('Uau, bem feito',    'green',  'Quem diria. Uma decisão financeira adulta.'),
            (60,  80): ('Mais ou menos',     'brand2', 'Podias ter poupado, mas pronto.'),
            (40,  60): ('Interessante...',   'yellow', 'Tenho a certeza que tinhas mesmo de comprar isto.'),
            (20,  40): ('Boa sorte aí',      'orange', 'Espero que o remorso venha com brinde.'),
            (0,   20): ('Magistral',         'red',    'Ninguém te bate nisto. Literalmente ninguém.'),
        },
        'calm': {
            (80, 101): ('Boa decisão',       'green',  'Esta compra alinha com os teus objetivos. Bem feito.'),
            (60,  80): ('Razoável',          'brand2', 'Há melhores opções, mas não foi má escolha.'),
            (40,  60): ('Reconsiderar',      'yellow', 'Vale a pena refletir se isto era mesmo necessário.'),
            (20,  40): ('Risco elevado',     'orange', 'Esta compra pode gerar arrependimento. Aprende para a próxima.'),
            (0,   20): ('Evitar repetir',    'red',    'Esta decisão não ajuda os teus objetivos financeiros.'),
        },
        'pro': {
            (80, 101): ('ROI Positivo',      'green',  'Investimento justificado. Custo-benefício favorável.'),
            (60,  80): ('ROI Neutro',        'brand2', 'Dentro do aceitável. Monitorizar uso.'),
            (40,  60): ('ROI Baixo',         'yellow', 'Retorno questionável. Rever prioridades.'),
            (20,  40): ('Capital em Risco',  'orange', 'Desperdício provável. Ajustar comportamento.'),
            (0,   20): ('Prejuízo Total',    'red',    'Gasto sem retorno mensurável. Reclassificar como custo de oportunidade perdida.'),
        },
    }

    p = personalidade if personalidade in personas else 'calm'
    for (low, high), (label, color, msg) in personas[p].items():
        if low <= score < high:
            return {'label': label, 'color': color, 'message': msg}
    return {'label': '—', 'color': 'muted', 'message': ''}


def calcular_score(categoria: str, preco: float, uso: str, personalidade: str = 'calm') -> dict:
    """
    Calcula o score de arrependimento/valia de uma compra.
    Retorna dict com score, label, color, message, chips.
    """
    base = USAGE_BASE.get(uso, 40)
    weight = CATEGORY_WEIGHTS.get(categoria, 0.90)
    penalty = _price_penalty(preco)

    raw = base * weight + penalty
    score = int(max(0, min(100, raw)))

    label_info = _score_label(score, personalidade)

    chips = []
    chips.append({'text': USAGE_LABELS.get(uso, uso), 'type': 'good' if score >= 60 else 'bad'})
    chips.append({'text': f'{preco:.2f}€', 'type': 'bad' if preco > 300 else 'mid'})
    chips.append({'text': categoria, 'type': 'mid'})
    if score < 40:
        chips.append({'text': 'Alto arrependimento', 'type': 'bad'})
    elif score >= 75:
        chips.append({'text': 'Compra validada', 'type': 'good'})

    return {
        'score': score,
        'label': label_info['label'],
        'color': label_info['color'],
        'message': label_info['message'],
        'chips': chips,
    }


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@scoring_bp.route('/scoring')
@login_required
def analisar():
    """GET /scoring — página principal do score de compras."""
    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    return render_template('scoring.html', personalidade=personalidade)


@scoring_bp.route('/scoring/analisar', methods=['POST'])
@login_required
def analisar_post():
    """
    POST /scoring/analisar
    Body JSON: { item, preco, categoria, uso }
    Devolve score + label + chips.
    """
    data = request.json or {}
    item      = data.get('item', 'Item').strip() or 'Item'
    preco     = float(data.get('preco') or 0)
    categoria = data.get('categoria', 'Outros')
    uso       = data.get('uso', 'monthly')

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'

    resultado = calcular_score(categoria, preco, uso, personalidade)
    resultado['item'] = item

    return jsonify({'success': True, 'resultado': resultado})


@scoring_bp.route('/scoring/fatura/<int:fatura_id>', methods=['GET'])
@login_required
def score_fatura(fatura_id):
    """
    GET /scoring/fatura/<id>
    Score automático de uma fatura já guardada.
    """
    fatura = Fatura.query.filter_by(id=fatura_id, user_id=current_user.id).first()
    if not fatura:
        return jsonify({'success': False, 'message': 'Fatura não encontrada.'})

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    resultado = calcular_score(
        categoria=fatura.categoria or 'Outros',
        preco=fatura.total or 0,
        uso='monthly',
        personalidade=personalidade,
    )
    resultado['item'] = fatura.loja or fatura.nome_ficheiro

    return jsonify({'success': True, 'resultado': resultado})