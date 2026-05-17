"""
app/api/insights.py — Insights da Verly com IA real

GET /api/v1/insights
    Gera insights personalizados com base nos dados reais do utilizador.
    Inclui: score, tendência, categorias, metas, previsão, subscrições detetadas.
"""

import json
from collections import defaultdict
from datetime import datetime, timedelta
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Fatura, User, Meta


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except ValueError:
            continue
    return None


def _get_data_obj(f):
    d = _parse_date(f.data_compra)
    if d:
        return d
    if f.data_upload:
        return f.data_upload if not hasattr(f.data_upload, 'date') else datetime.combine(f.data_upload.date(), datetime.min.time())
    return None


def _build_context(user_id: int) -> dict:
    """Recolhe todos os dados financeiros do utilizador para contexto do LLM."""
    hoje = datetime.utcnow()
    mes_atual = hoje.month
    ano_atual = hoje.year
    dia_atual = hoje.day

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    metas = Meta.query.filter_by(user_id=user_id).all()
    user = User.query.get(user_id)

    gastos_mes = defaultdict(float)
    gastos_mes_anterior = defaultdict(float)
    total_mes = 0.0
    total_mes_anterior = 0.0
    faturas_mes = []

    # Histórico mensal (últimos 6 meses)
    historico_mensal = defaultdict(float)

    for f in faturas:
        data = _get_data_obj(f)
        if not data:
            continue
        valor = f.total or 0
        cat = (f.categoria or 'outros').lower()

        if data.month == mes_atual and data.year == ano_atual:
            gastos_mes[cat] += valor
            total_mes += valor
            faturas_mes.append({
                'loja': f.loja or f.nome_ficheiro or 'Desconhecida',
                'categoria': cat,
                'valor': round(valor, 2),
                'data': data.strftime('%d/%m/%Y'),
            })

        mes_ant = mes_atual - 1 if mes_atual > 1 else 12
        ano_ant = ano_atual if mes_atual > 1 else ano_atual - 1
        if data.month == mes_ant and data.year == ano_ant:
            gastos_mes_anterior[cat] += valor
            total_mes_anterior += valor

        # Histórico últimos 6 meses
        chave = f"{data.year}-{data.month:02d}"
        historico_mensal[chave] += valor

    # Top categorias
    top_cats = sorted(gastos_mes.items(), key=lambda x: x[1], reverse=True)[:6]

    # Metas vs gastos
    metas_info = []
    for m in metas:
        cat_lower = (m.categoria or '').lower()
        gasto = gastos_mes.get(cat_lower, 0)
        pct = (gasto / m.valor_limite * 100) if m.valor_limite > 0 else 0
        metas_info.append({
            'categoria': m.categoria,
            'limite': round(m.valor_limite, 2),
            'gasto': round(gasto, 2),
            'pct': round(pct, 1),
            'ultrapassou': gasto > m.valor_limite,
        })

    # Variação mês anterior
    variacao_pct = None
    if total_mes_anterior > 0:
        variacao_pct = round(((total_mes - total_mes_anterior) / total_mes_anterior) * 100, 1)

    # ── Previsão mensal ───────────────────────────────────────────────────────
    # Extrapola o gasto atual para o fim do mês com base nos dias passados
    dias_no_mes = 31  # aproximação
    previsao_mensal = None
    if dia_atual > 0 and total_mes > 0:
        taxa_diaria = total_mes / dia_atual
        previsao_mensal = round(taxa_diaria * dias_no_mes, 2)

    # ── Subscrições detetadas ─────────────────────────────────────────────────
    # Lojas que aparecem em múltiplos meses = subscrição provável
    lojas_por_mes = defaultdict(set)
    for f in faturas:
        data = _get_data_obj(f)
        if not data or not f.loja:
            continue
        chave_mes = f"{data.year}-{data.month:02d}"
        lojas_por_mes[f.loja.lower()].add(chave_mes)

    subscricoes_detetadas = []
    for loja, meses in lojas_por_mes.items():
        if len(meses) >= 2:  # aparece em 2+ meses = subscrição provável
            # Calcular valor médio mensal
            valores = [f.total or 0 for f in faturas if f.loja and f.loja.lower() == loja]
            valor_medio = sum(valores) / len(valores) if valores else 0
            if valor_medio > 0:
                subscricoes_detetadas.append({
                    'nome': loja.title(),
                    'valor_mensal': round(valor_medio, 2),
                    'meses_detetados': len(meses),
                })

    subscricoes_detetadas = sorted(subscricoes_detetadas, key=lambda x: x['valor_mensal'], reverse=True)[:5]
    total_subscricoes = sum(s['valor_mensal'] for s in subscricoes_detetadas)

    # ── Histórico 6 meses para gráfico ────────────────────────────────────────
    historico_lista = []
    for i in range(5, -1, -1):
        mes = mes_atual - i
        ano = ano_atual
        if mes <= 0:
            mes += 12
            ano -= 1
        chave = f"{ano}-{mes:02d}"
        meses_pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        historico_lista.append({
            'mes': meses_pt[mes - 1],
            'valor': round(historico_mensal.get(chave, 0), 2),
        })

    # Dados do utilizador
    rendimento = getattr(user, 'rendimento_mensal', None) or 0
    orcamento = getattr(user, 'orcamento_mensal', None) or 0
    nome = getattr(user, 'nome', 'utilizador') or 'utilizador'
    objetivo = getattr(user, 'objetivo', 'controlar') or 'controlar'
    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    return {
        'nome': nome.split()[0] if nome else 'utilizador',
        'personalidade': personalidade,
        'objetivo': objetivo,
        'rendimento_mensal': round(rendimento, 2),
        'orcamento_mensal': round(orcamento, 2),
        'total_gasto_mes': round(total_mes, 2),
        'total_gasto_mes_anterior': round(total_mes_anterior, 2),
        'variacao_pct': variacao_pct,
        'top_categorias': [{'categoria': c, 'valor': round(v, 2)} for c, v in top_cats],
        'metas': metas_info,
        'num_faturas_mes': len(faturas_mes),
        'faturas_recentes': faturas_mes[-5:],
        'previsao_mensal': previsao_mensal,
        'subscricoes_detetadas': subscricoes_detetadas,
        'total_subscricoes': round(total_subscricoes, 2),
        'historico_mensal': historico_lista,
        'dia_atual': dia_atual,
    }


def _gerar_insights_llm(ctx: dict, personalidade: str) -> list:
    """Chama o LLM para gerar insights personalizados."""

    SYSTEM_PROMPTS = {
        'savage': """És a Verly, uma assistente financeira BRUTAL e sem filtros.
Analisa os dados financeiros e dá insights cortantes mas verdadeiros.
Sem rodeios. Linguagem direta.""",

        'sarcastic': """És a Verly, uma assistente financeira SARCÁSTICA e irónica.
Analisa os dados financeiros com ironia inteligente mas construtiva.""",

        'calm': """És a Verly, uma coach financeira empática e construtiva.
Analisa os dados financeiros com tom equilibrado e encorajador.""",

        'pro': """És a Verly, um CFO pessoal analítico.
Analisa os dados financeiros com rigor técnico e linguagem de negócio.""",
    }

    system = SYSTEM_PROMPTS.get(personalidade, SYSTEM_PROMPTS['calm'])

    metas_txt = ''
    if ctx['metas']:
        linhas = []
        for m in ctx['metas']:
            status = 'ULTRAPASSOU' if m['ultrapassou'] else f"{m['pct']}% usado"
            linhas.append(f"  - {m['categoria']}: limite {m['limite']}€, gasto {m['gasto']}€ ({status})")
        metas_txt = '\nMetas:\n' + '\n'.join(linhas)

    variacao_txt = ''
    if ctx['variacao_pct'] is not None:
        sinal = '+' if ctx['variacao_pct'] > 0 else ''
        variacao_txt = f"\nVariação vs mês anterior: {sinal}{ctx['variacao_pct']}%"

    rendimento_txt = ''
    if ctx['rendimento_mensal'] > 0:
        pct_rendimento = round((ctx['total_gasto_mes'] / ctx['rendimento_mensal']) * 100, 1)
        rendimento_txt = f"\nRendimento mensal: {ctx['rendimento_mensal']}€ (gastou {pct_rendimento}% do rendimento)"

    orcamento_txt = ''
    if ctx['orcamento_mensal'] > 0:
        pct_orc = round((ctx['total_gasto_mes'] / ctx['orcamento_mensal']) * 100, 1)
        orcamento_txt = f"\nOrçamento mensal definido: {ctx['orcamento_mensal']}€ ({pct_orc}% usado)"

    previsao_txt = ''
    if ctx['previsao_mensal']:
        previsao_txt = f"\nPrevisão de gasto até fim do mês: {ctx['previsao_mensal']}€ (baseado nos primeiros {ctx['dia_atual']} dias)"

    subscricoes_txt = ''
    if ctx['subscricoes_detetadas']:
        linhas = [f"  - {s['nome']}: ~{s['valor_mensal']}€/mês" for s in ctx['subscricoes_detetadas']]
        subscricoes_txt = f"\nSubscrições detetadas (total: {ctx['total_subscricoes']}€/mês):\n" + '\n'.join(linhas)

    top_cats_txt = '\n'.join([f"  - {c['categoria']}: {c['valor']}€" for c in ctx['top_categorias']])

    user_prompt = f"""Dados financeiros de {ctx['nome']} este mês:

Total gasto: {ctx['total_gasto_mes']}€
Número de faturas: {ctx['num_faturas_mes']}
Objetivo do utilizador: {ctx['objetivo']}{rendimento_txt}{orcamento_txt}{variacao_txt}{previsao_txt}

Top categorias de gasto:
{top_cats_txt}{metas_txt}{subscricoes_txt}

Gera exatamente 5 insights personalizados e relevantes com base nestes dados reais.
Tipos: alerta, tendencia, positivo, dica, previsao.

Regras:
- Usa os valores reais dos dados (não inventes números)
- Sé específico — menciona categorias, valores, percentagens reais
- Se houver subscrições, comenta sobre o impacto mensal
- Se houver previsão, usa-a num insight de tipo "previsao"
- Adapta o tom à personalidade: {personalidade}

Responde APENAS com um array JSON válido, sem markdown, sem texto extra:
[
  {{
    "tipo": "alerta|tendencia|positivo|dica|previsao",
    "texto": "frase do insight (máx 2 frases, tom adaptado à personalidade)",
    "valor": null ou número relevante
  }},
  ...
]"""

    try:
        import os
        from groq import Groq
        client = Groq(api_key=os.getenv('GROQ_API_KEY', ''))
        response = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user',   'content': user_prompt},
            ],
            max_tokens=800,
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        import re
        raw = re.sub(r'```json|```', '', raw).strip()
        insights = json.loads(raw)
        if isinstance(insights, list):
            return insights[:6]
        return []
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'Erro ao gerar insights LLM: {e}')
        # Fallback com insights básicos
        insights = []
        if ctx['total_gasto_mes'] > 0:
            insights.append({
                'tipo': 'dica',
                'texto': f"Gastaste {ctx['total_gasto_mes']}€ este mês em {ctx['num_faturas_mes']} compras.",
                'valor': ctx['total_gasto_mes'],
            })
        if ctx['orcamento_mensal'] > 0 and ctx['total_gasto_mes'] > ctx['orcamento_mensal']:
            insights.append({
                'tipo': 'alerta',
                'texto': f"Ultrapassaste o teu orçamento de {ctx['orcamento_mensal']}€.",
                'valor': ctx['total_gasto_mes'] - ctx['orcamento_mensal'],
            })
        if ctx['previsao_mensal']:
            insights.append({
                'tipo': 'previsao',
                'texto': f"Ao ritmo atual, vais gastar cerca de {ctx['previsao_mensal']}€ este mês.",
                'valor': ctx['previsao_mensal'],
            })
        return insights


# ── Endpoint ──────────────────────────────────────────────────────────────────

@api_bp.route('/insights', methods=['GET'])
@jwt_required()
def get_insights():
    """
    Gera insights personalizados com IA para o utilizador autenticado.
    """
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'message': 'Utilizador não encontrado.'}), 404

    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    ctx = _build_context(user_id)
    insights = _gerar_insights_llm(ctx, personalidade)

    return jsonify({
        'success': True,
        'insights': insights,
        'resumo': {
            'total_gasto':       ctx['total_gasto_mes'],
            'num_faturas':       ctx['num_faturas_mes'],
            'variacao_pct':      ctx['variacao_pct'],
            'variacao_subiu':    (ctx['variacao_pct'] or 0) > 0,
            'orcamento_mensal':  ctx['orcamento_mensal'],
            'rendimento_mensal': ctx['rendimento_mensal'],
            'pct_orcamento':     round((ctx['total_gasto_mes'] / ctx['orcamento_mensal'] * 100), 1) if ctx['orcamento_mensal'] > 0 else None,
            'pct_rendimento':    round((ctx['total_gasto_mes'] / ctx['rendimento_mensal'] * 100), 1) if ctx['rendimento_mensal'] > 0 else None,
            'top_categorias':    ctx['top_categorias'],
            'metas':             ctx['metas'],
            'previsao_mensal':   ctx['previsao_mensal'],
            'subscricoes':       ctx['subscricoes_detetadas'],
            'total_subscricoes': ctx['total_subscricoes'],
            'historico_mensal':  ctx['historico_mensal'],
        },
        'personalidade': personalidade,
        'sem_dados': ctx['num_faturas_mes'] == 0 and ctx['total_gasto_mes'] == 0,
    })