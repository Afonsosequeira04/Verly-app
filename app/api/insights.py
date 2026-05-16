"""
app/api/insights.py — Insights da Verly com IA real

GET /api/v1/insights
    Gera insights personalizados com base nos dados reais do utilizador.
    Usa o LLM (Groq via LlamaIndex) que já existe no projeto.
    Devolve até 6 insights categorizados por tipo: alerta, tendencia, positivo, dica.

Registar em app/api/__init__.py:
    from app.api import insights  # noqa
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

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    metas = Meta.query.filter_by(user_id=user_id).all()
    user = User.query.get(user_id)

    # ── Gastos do mês atual ───────────────────────────────────────────────────
    gastos_mes = defaultdict(float)
    gastos_mes_anterior = defaultdict(float)
    total_mes = 0.0
    total_mes_anterior = 0.0
    faturas_mes = []

    for f in faturas:
        data = _get_data_obj(f)
        if not data:
            continue
        valor = f.total or 0
        cat = f.categoria or 'Outros'

        if data.month == mes_atual and data.year == ano_atual:
            gastos_mes[cat] += valor
            total_mes += valor
            faturas_mes.append({
                'loja': f.loja or f.nome_ficheiro or 'Desconhecida',
                'categoria': cat,
                'valor': round(valor, 2),
                'data': data.strftime('%d/%m/%Y'),
            })
        elif data.month == (mes_atual - 1 or 12) and data.year == (ano_atual if mes_atual > 1 else ano_atual - 1):
            gastos_mes_anterior[cat] += valor
            total_mes_anterior += valor

    # ── Top categorias ────────────────────────────────────────────────────────
    top_cats = sorted(gastos_mes.items(), key=lambda x: x[1], reverse=True)[:5]

    # ── Metas vs gastos ───────────────────────────────────────────────────────
    metas_info = []
    for m in metas:
        gasto = gastos_mes.get(m.categoria, 0)
        pct = (gasto / m.valor_limite * 100) if m.valor_limite > 0 else 0
        metas_info.append({
            'categoria': m.categoria,
            'limite': round(m.valor_limite, 2),
            'gasto': round(gasto, 2),
            'pct': round(pct, 1),
            'ultrapassou': gasto > m.valor_limite,
        })

    # ── Variação mês anterior ─────────────────────────────────────────────────
    variacao_pct = None
    if total_mes_anterior > 0:
        variacao_pct = round(((total_mes - total_mes_anterior) / total_mes_anterior) * 100, 1)

    # ── Rendimento e orçamento ────────────────────────────────────────────────
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
        'faturas_recentes': faturas_mes[-5:],  # últimas 5
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

    # Construir resumo de metas para o prompt
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

    top_cats_txt = '\n'.join([f"  - {c['categoria']}: {c['valor']}€" for c in ctx['top_categorias']])

    user_prompt = f"""Dados financeiros de {ctx['nome']} este mês:

Total gasto: {ctx['total_gasto_mes']}€
Número de faturas: {ctx['num_faturas_mes']}
Objetivo do utilizador: {ctx['objetivo']}{rendimento_txt}{orcamento_txt}{variacao_txt}

Top categorias de gasto:
{top_cats_txt}{metas_txt}

Gera exatamente 4 insights personalizados e relevantes com base nestes dados reais.
Cada insight deve ter um tipo diferente se possível: alerta, tendencia, positivo, dica.

Regras:
- Usa os valores reais dos dados (não inventes números)
- Sé específico — menciona categorias, valores, percentagens reais
- Se não houver dados suficientes para um tipo, repete outro tipo
- Adapta o tom à personalidade: {personalidade}

Responde APENAS com um array JSON válido, sem markdown, sem texto extra:
[
  {{
    "tipo": "alerta|tendencia|positivo|dica",
    "texto": "frase do insight (máx 2 frases, tom adaptado à personalidade)",
    "valor": null ou número relevante
  }},
  ...
]"""

    try:
        from llama_index.core import Settings
        llm = Settings.llm
        response = llm.complete(user_prompt, system_prompt=system)
        raw = str(response).strip()

        # Limpar possível markdown
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip().rstrip('```').strip()

        insights = json.loads(raw)

        # Validar e limpar
        valid = []
        for item in insights:
            if isinstance(item, dict) and 'tipo' in item and 'texto' in item:
                valid.append({
                    'tipo': item.get('tipo', 'dica'),
                    'texto': str(item.get('texto', '')),
                    'valor': item.get('valor'),
                })
        return valid[:6]

    except Exception as e:
        # Fallback: insights estáticos baseados nos dados reais
        return _fallback_insights(ctx)


def _fallback_insights(ctx: dict) -> list:
    """Insights determinísticos quando o LLM falha, baseados nos dados reais."""
    insights = []

    # 1. Variação vs mês anterior
    if ctx['variacao_pct'] is not None:
        if ctx['variacao_pct'] > 15:
            insights.append({
                'tipo': 'alerta',
                'texto': f"Gastaste {ctx['variacao_pct']}% mais do que no mês passado. Verifica o que aumentou nas tuas despesas.",
                'valor': ctx['total_gasto_mes'],
            })
        elif ctx['variacao_pct'] < -10:
            insights.append({
                'tipo': 'positivo',
                'texto': f"Boa gestão! Reduziste os gastos em {abs(ctx['variacao_pct'])}% em relação ao mês anterior.",
                'valor': ctx['total_gasto_mes'],
            })

    # 2. Orçamento
    if ctx['orcamento_mensal'] > 0:
        pct = (ctx['total_gasto_mes'] / ctx['orcamento_mensal']) * 100
        if pct > 90:
            insights.append({
                'tipo': 'alerta',
                'texto': f"Já usaste {round(pct, 0):.0f}% do teu orçamento mensal de {ctx['orcamento_mensal']}€.",
                'valor': ctx['orcamento_mensal'] - ctx['total_gasto_mes'],
            })
        elif pct < 50:
            insights.append({
                'tipo': 'positivo',
                'texto': f"Estás em boa forma — apenas {round(pct, 0):.0f}% do orçamento mensal usado.",
                'valor': ctx['orcamento_mensal'] - ctx['total_gasto_mes'],
            })

    # 3. Rendimento
    if ctx['rendimento_mensal'] > 0:
        pct = (ctx['total_gasto_mes'] / ctx['rendimento_mensal']) * 100
        insights.append({
            'tipo': 'tendencia',
            'texto': f"Este mês usaste {round(pct, 1)}% do teu rendimento. O ideal é ficar abaixo de 70%.",
            'valor': ctx['total_gasto_mes'],
        })

    # 4. Metas ultrapassadas
    for m in ctx['metas']:
        if m['ultrapassou']:
            insights.append({
                'tipo': 'alerta',
                'texto': f"Ultrapassaste o limite de {m['categoria']} ({m['limite']}€). Gasto atual: {m['gasto']}€.",
                'valor': m['gasto'],
            })
            break

    # 5. Top categoria
    if ctx['top_categorias']:
        top = ctx['top_categorias'][0]
        insights.append({
            'tipo': 'dica',
            'texto': f"A tua principal despesa este mês é {top['categoria']} com {top['valor']}€. Há espaço para reduzir?",
            'valor': top['valor'],
        })

    # 6. Padrão de compras
    if ctx['num_faturas_mes'] > 10:
        insights.append({
            'tipo': 'tendencia',
            'texto': f"Fizeste {ctx['num_faturas_mes']} compras este mês. Consolida compras para poupar em portes e impulsos.",
            'valor': None,
        })
    elif ctx['num_faturas_mes'] == 0:
        insights.append({
            'tipo': 'dica',
            'texto': "Ainda não tens faturas este mês. Começa a registar as tuas despesas para insights mais precisos.",
            'valor': None,
        })

    return insights[:6] if insights else [
        {
            'tipo': 'dica',
            'texto': "Adiciona faturas e define um orçamento mensal para a Verly te dar insights personalizados.",
            'valor': None,
        }
    ]


# ── Endpoint principal ────────────────────────────────────────────────────────

@api_bp.route('/insights', methods=['GET'])
@jwt_required()
def get_insights():
    """
    Gera insights personalizados com IA para o utilizador autenticado.
    Combina dados reais (gastos, metas, rendimento) com o LLM do projeto.
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
            'total_gasto': ctx['total_gasto_mes'],
            'num_faturas': ctx['num_faturas_mes'],
            'variacao_pct': ctx['variacao_pct'],
            'variacao_subiu': (ctx['variacao_pct'] or 0) > 0,
            'orcamento_mensal': ctx['orcamento_mensal'],
            'rendimento_mensal': ctx['rendimento_mensal'],
            'pct_orcamento': round((ctx['total_gasto_mes'] / ctx['orcamento_mensal'] * 100), 1) if ctx['orcamento_mensal'] > 0 else None,
            'pct_rendimento': round((ctx['total_gasto_mes'] / ctx['rendimento_mensal'] * 100), 1) if ctx['rendimento_mensal'] > 0 else None,
        },
        'personalidade': personalidade,
    })