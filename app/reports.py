"""
reports.py — Financial Damage Report
Gera o relatório mensal: gasto total, desperdício estimado, categorias de arrependimento,
e a frase de impacto personalizada por personalidade.
"""
import json
from datetime import datetime
from collections import defaultdict
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from app.models import Fatura

reports_bp = Blueprint('reports', __name__)


# Categorias com alto índice de arrependimento histórico
HIGH_REGRET_CATEGORIES = {'Entretenimento', 'Vestuário', 'Outros'}
# Categorias consideradas essenciais (baixo arrependimento)
LOW_REGRET_CATEGORIES  = {'Alimentação', 'Saúde & Beleza', 'Educação', 'Transportes'}


def _regret_factor(categoria: str) -> float:
    """Percentagem estimada de desperdício por categoria."""
    factors = {
        'Tecnologia':       0.25,
        'Entretenimento':   0.45,
        'Vestuário':        0.35,
        'Casa & Decoração': 0.20,
        'Saúde & Beleza':   0.15,
        'Desporto':         0.20,
        'Alimentação':      0.05,
        'Transportes':      0.10,
        'Educação':         0.05,
        'Outros':           0.40,
    }
    return factors.get(categoria, 0.30)


def _roast_phrase(total_gasto: float, desperdicado: float, top_cat: str, personalidade: str) -> str:
    poupanca = round(desperdicado)
    frases = {
        'savage': [
            f"Gastaste {total_gasto:.0f}€. {desperdicado:.0f}€ foram literalmente para o lixo. Parabéns pela consistência.",
            f"O teu histórico financeiro é uma obra de ficção científica. {poupanca}€ desperdiçados este mês.",
            f"'{top_cat}' é a tua categoria favorita de combustão de dinheiro. Impressionante.",
        ],
        'sarcastic': [
            f"Ah, só {desperdicado:.0f}€ desperdiçados. Modesto para os teus padrões.",
            f"Podias ter poupado {poupanca}€. Mas escolheste o caos. Claro.",
            f"'{top_cat}' levou a melhor. Quem precisava de poupanças mesmo?",
        ],
        'calm': [
            f"Este mês gastaste {total_gasto:.0f}€, dos quais cerca de {desperdicado:.0f}€ podiam ter sido poupados. É um bom ponto de partida para reflexão.",
            f"Identificámos {poupanca}€ de oportunidades de poupança. Pequenas mudanças fazem grande diferença.",
            f"A categoria '{top_cat}' tem espaço para optimização. Vamos trabalhar nisso juntos.",
        ],
        'pro': [
            f"Análise mensal: {total_gasto:.0f}€ gastos. Índice de desperdício: {(desperdicado/total_gasto*100):.1f}% ({desperdicado:.0f}€). Acção requerida.",
            f"Capital desperdiçado: {desperdicado:.0f}€/mês = {desperdicado*12:.0f}€/ano. ROI da optimização: alto.",
            f"Categoria crítica: '{top_cat}'. Recomendação: reduzir 30% nesta área. Potencial de poupança: {poupanca*0.3:.0f}€/mês.",
        ],
    }
    import random
    p = personalidade if personalidade in frases else 'calm'
    # Escolher frase baseada no total (determinístico para o mesmo mês)
    idx = int(total_gasto) % len(frases[p])
    return frases[p][idx]


def gerar_relatorio(user_id: int, mes: int = None, ano: int = None) -> dict:
    """
    Gera o relatório financeiro mensal para o utilizador.
    Se mes/ano não forem fornecidos, usa o mês corrente.
    """
    hoje = datetime.utcnow()
    mes = mes or hoje.month
    ano = ano or hoje.year

    # Filtrar faturas do mês
    faturas_mes = [
        f for f in Fatura.query.filter_by(user_id=user_id).all()
        if f.data_upload and f.data_upload.month == mes and f.data_upload.year == ano
    ]

    # Faturas do mês anterior para comparação
    mes_ant = mes - 1 if mes > 1 else 12
    ano_ant  = ano if mes > 1 else ano - 1
    faturas_ant = [
        f for f in Fatura.query.filter_by(user_id=user_id).all()
        if f.data_upload and f.data_upload.month == mes_ant and f.data_upload.year == ano_ant
    ]

    # Totais
    total_gasto = sum(f.total or 0 for f in faturas_mes)
    total_ant   = sum(f.total or 0 for f in faturas_ant)

    # Por categoria
    por_categoria = defaultdict(float)
    for f in faturas_mes:
        cat = f.categoria or 'Outros'
        por_categoria[cat] += f.total or 0

    # Desperdício estimado por categoria
    desperdicado = sum(
        valor * _regret_factor(cat)
        for cat, valor in por_categoria.items()
    )
    boas_decisoes = total_gasto - desperdicado

    # Top categoria de gasto
    top_cat = max(por_categoria, key=por_categoria.get) if por_categoria else 'Outros'

    # Variação vs mês anterior
    variacao = ((total_gasto - total_ant) / total_ant * 100) if total_ant > 0 else 0

    # Barras (sorted por valor, top 6)
    categorias_sorted = sorted(por_categoria.items(), key=lambda x: x[1], reverse=True)[:6]
    max_val = categorias_sorted[0][1] if categorias_sorted else 1

    barras = []
    for cat, val in categorias_sorted:
        barras.append({
            'categoria':  cat,
            'valor':      round(val, 2),
            'percentagem': round(val / max_val * 100),
            'desperdicado': round(val * _regret_factor(cat), 2),
            'regret_pct':  int(_regret_factor(cat) * 100),
        })

    # Top lojas
    por_loja = defaultdict(float)
    for f in faturas_mes:
        if f.loja:
            por_loja[f.loja] += f.total or 0
    top_lojas = sorted(por_loja.items(), key=lambda x: x[1], reverse=True)[:5]

    # Número de faturas por categoria de arrependimento
    alto_arr = sum(v for c, v in por_categoria.items() if c in HIGH_REGRET_CATEGORIES)

    return {
        'mes':              mes,
        'ano':              ano,
        'mes_nome':         _nome_mes(mes),
        'total_gasto':      round(total_gasto, 2),
        'total_ant':        round(total_ant, 2),
        'variacao':         round(variacao, 1),
        'desperdicado':     round(desperdicado, 2),
        'boas_decisoes':    round(boas_decisoes, 2),
        'num_faturas':      len(faturas_mes),
        'top_cat':          top_cat,
        'alto_arrependimento': round(alto_arr, 2),
        'barras':           barras,
        'top_lojas':        [{'loja': l, 'valor': round(v, 2)} for l, v in top_lojas],
        'roast_phrase':     '',   # preenchido com personalidade no route
    }


def _nome_mes(mes: int) -> str:
    nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
             'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    return nomes[mes] if 1 <= mes <= 12 else str(mes)


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@reports_bp.route('/relatorio')
@login_required
def relatorio():
    mes = request.args.get('mes', type=int)
    ano = request.args.get('ano', type=int)
    data = gerar_relatorio(current_user.id, mes, ano)

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    if data['total_gasto'] > 0:
        data['roast_phrase'] = _roast_phrase(
            data['total_gasto'], data['desperdicado'],
            data['top_cat'], personalidade
        )
    else:
        data['roast_phrase'] = 'Sem dados este mês. Carrega as tuas faturas!'

    # Meses disponíveis (para navegação)
    hoje = datetime.utcnow()
    meses_nav = []
    for i in range(6):
        m = hoje.month - i
        a = hoje.year
        if m <= 0:
            m += 12
            a -= 1
        meses_nav.append({'mes': m, 'ano': a, 'nome': _nome_mes(m)})
    data['meses_nav'] = meses_nav

    return render_template('relatorio.html', **data)


@reports_bp.route('/relatorio/api')
@login_required
def relatorio_api():
    mes = request.args.get('mes', type=int)
    ano = request.args.get('ano', type=int)
    data = gerar_relatorio(current_user.id, mes, ano)

    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    data['roast_phrase'] = _roast_phrase(
        data['total_gasto'], data['desperdicado'],
        data['top_cat'], personalidade
    ) if data['total_gasto'] > 0 else 'Sem dados este mês.'

    return jsonify({'success': True, **data})
