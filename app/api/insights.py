"""
app/api/insights.py — Insights da Verly com IA real + princípios financeiros

GET /api/v1/insights
GET /api/v1/poupanca
"""

import json
import re
import logging
from collections import defaultdict
from datetime import datetime
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.financial_intelligence import build_financial_intelligence
from app.financial_records import normalize_text, summarize_expenses
from app.models import Fatura, User, Meta
from app.extensions import cache

logger = logging.getLogger(__name__)


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
        return f.data_upload if not hasattr(f.data_upload, 'date') else datetime.combine(
            f.data_upload.date(), datetime.min.time()
        )
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

    summary = summarize_expenses(user_id, today=hoje.date())
    budget_summary = (
        summary if summary['currency'] == 'EUR'
        else summarize_expenses(user_id, today=hoje.date(), currency='EUR')
    )
    total_mes = summary['mes_atual']['total']
    total_mes_anterior = summary['mes_anterior']['total']
    top_cats = [
        (item['categoria'], item['valor'])
        for item in summary['mes_atual']['por_categoria'][:6]
    ]

    current_month_key = f'{ano_atual}-{mes_atual:02d}'
    registos_mes = [
        record for record in summary['records']
        if record['month'] == current_month_key
    ]
    registos_mes_payload = [
        {
            'loja': item['merchant'] or 'Desconhecida',
            'categoria': item['categoria'],
            'valor': round(item['value'], 2),
            'currency': item['currency'],
            'data': item['date'].strftime('%d/%m/%Y') if item['date'] else None,
            'fonte': item['source'],
        }
        for item in registos_mes[:8]
    ]

    gastos_mes = {
        normalize_text(item['categoria']): item['valor']
        for item in budget_summary['mes_atual']['por_categoria']
    }

    metas_info = []
    for m in metas:
        cat_lower = normalize_text(m.categoria)
        gasto = gastos_mes.get(cat_lower, 0)
        pct = (gasto / m.valor_limite * 100) if m.valor_limite > 0 else 0
        metas_info.append({
            'categoria': m.categoria,
            'limite': round(m.valor_limite, 2),
            'gasto': round(gasto, 2),
            'currency': 'EUR',
            'pct': round(pct, 1),
            'ultrapassou': gasto > m.valor_limite,
        })

    try:
        from app.subscriptions import detect_subscriptions
        subs_data = detect_subscriptions(user_id)
        subscricoes_detetadas = [
            {
                'nome': sub['nome'],
                'valor_mensal': round(sub.get('preco_mensal', 0), 2),
                'meses_detetados': sub.get('meses_pago', 1),
                'fonte': sub.get('fonte'),
            }
            for sub in subs_data.get('subscriptions', [])[:5]
        ]
    except Exception:
        subs_data = {}
        subscricoes_detetadas = []

    try:
        from app.semantic_finance import semantic_examples_for_insights
        memoria_semantica = semantic_examples_for_insights(user_id)
    except Exception:
        memoria_semantica = []

    total_subscricoes = sum(s['valor_mensal'] for s in subscricoes_detetadas)

    rendimento = getattr(user, 'rendimento_mensal', None) or 0
    orcamento = getattr(user, 'orcamento_mensal', None) or 0
    nome = getattr(user, 'nome', 'utilizador') or 'utilizador'
    objetivo = getattr(user, 'objetivo', 'controlar') or 'controlar'
    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    regra_5030_20 = None
    if rendimento > 0:
        gasto_orcamento = budget_summary['mes_atual']['total']
        regra_5030_20 = {
            'necessidades_ideal': round(rendimento * 0.50, 2),
            'desejos_ideal': round(rendimento * 0.30, 2),
            'poupanca_ideal': round(rendimento * 0.20, 2),
            'gasto_atual': round(gasto_orcamento, 2),
            'currency': 'EUR',
            'active_currency': summary['currency'],
            'currency_mismatch': summary['currency'] != 'EUR',
            'pct_rendimento': round((gasto_orcamento / rendimento) * 100, 1),
        }

    risco_concentracao = None
    if top_cats and total_mes > 0:
        top_cat_nome, top_cat_val = top_cats[0]
        top_cat_pct = round((top_cat_val / total_mes) * 100, 1)
        if top_cat_pct > 40:
            risco_concentracao = {
                'categoria': top_cat_nome,
                'pct': top_cat_pct,
                'valor': round(top_cat_val, 2),
            }

    itens_por_categoria = dict(summary['mes_atual']['itens_por_categoria'])
    for categoria, _valor in top_cats:
        itens_por_categoria[categoria.lower()] = itens_por_categoria.get(
            normalize_text(categoria),
            [],
        )

    return {
        'nome': nome.split()[0] if nome else 'utilizador',
        'personalidade': personalidade,
        'objetivo': objetivo,
        'rendimento_mensal': round(rendimento, 2),
        'orcamento_mensal': round(orcamento, 2),
        'total_gasto_mes': round(total_mes, 2),
        'total_gasto_mes_anterior': round(total_mes_anterior, 2),
        'currency': summary['currency'],
        'available_currencies': summary['available_currencies'],
        'outras_moedas': summary['other_currencies'],
        'movimentos_excluidos': summary['excluded'],
        'variacao_pct': summary['variacao_pct'],
        'top_categorias': [
            {'categoria': c, 'valor': round(v, 2), 'currency': summary['currency']}
            for c, v in top_cats
        ],
        'metas': metas_info,
        'num_faturas_mes': len(registos_mes),
        'faturas_recentes': registos_mes_payload,
        'previsao_mensal': summary['previsao_mensal'],
        'subscricoes_detetadas': subscricoes_detetadas,
        'total_subscricoes': round(total_subscricoes, 2),
        'historico_mensal': summary['historico_mensal'],
        'dia_atual': dia_atual,
        'regra_5030_20': regra_5030_20,
        'risco_concentracao': risco_concentracao,
        'itens_por_categoria': itens_por_categoria,
        'memoria_semantica': memoria_semantica,
        'financial_intelligence': build_financial_intelligence(user, summary, budget_summary, subs_data),
    }

    gastos_mes = defaultdict(float)
    gastos_mes_anterior = defaultdict(float)
    total_mes = 0.0
    total_mes_anterior = 0.0
    faturas_mes = []
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

        chave = f"{data.year}-{data.month:02d}"
        historico_mensal[chave] += valor

    top_cats = sorted(gastos_mes.items(), key=lambda x: x[1], reverse=True)[:6]

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

    variacao_pct = None
    if total_mes_anterior > 0:
        variacao_pct = round(((total_mes - total_mes_anterior) / total_mes_anterior) * 100, 1)

    dias_no_mes = 31
    previsao_mensal = None
    if dia_atual > 0 and total_mes > 0:
        taxa_diaria = total_mes / dia_atual
        previsao_mensal = round(taxa_diaria * dias_no_mes, 2)

    lojas_por_mes = defaultdict(set)
    for f in faturas:
        data = _get_data_obj(f)
        if not data or not f.loja:
            continue
        chave_mes = f"{data.year}-{data.month:02d}"
        lojas_por_mes[f.loja.lower()].add(chave_mes)

    subscricoes_detetadas = []
    for loja, meses in lojas_por_mes.items():
        if len(meses) >= 2:
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

    meses_pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    historico_lista = []
    for i in range(5, -1, -1):
        mes = mes_atual - i
        ano = ano_atual
        if mes <= 0:
            mes += 12
            ano -= 1
        chave = f"{ano}-{mes:02d}"
        historico_lista.append({
            'mes': meses_pt[mes - 1],
            'valor': round(historico_mensal.get(chave, 0), 2),
        })

    rendimento = getattr(user, 'rendimento_mensal', None) or 0
    orcamento = getattr(user, 'orcamento_mensal', None) or 0
    nome = getattr(user, 'nome', 'utilizador') or 'utilizador'
    objetivo = getattr(user, 'objetivo', 'controlar') or 'controlar'
    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    regra_5030_20 = None
    if rendimento > 0:
        necessidades_ideal = rendimento * 0.50
        desejos_ideal = rendimento * 0.30
        poupanca_ideal = rendimento * 0.20
        regra_5030_20 = {
            'necessidades_ideal': round(necessidades_ideal, 2),
            'desejos_ideal': round(desejos_ideal, 2),
            'poupanca_ideal': round(poupanca_ideal, 2),
            'gasto_atual': round(total_mes, 2),
            'pct_rendimento': round((total_mes / rendimento) * 100, 1),
        }

    risco_concentracao = None
    if top_cats and total_mes > 0:
        top_cat_nome, top_cat_val = top_cats[0]
        top_cat_pct = round((top_cat_val / total_mes) * 100, 1)
        if top_cat_pct > 40:
            risco_concentracao = {
                'categoria': top_cat_nome,
                'pct': top_cat_pct,
                'valor': round(top_cat_val, 2),
            }

    itens_por_categoria = {}
    for fatura in faturas_mes:
        cat = fatura['categoria']
        if cat not in itens_por_categoria:
            itens_por_categoria[cat] = []
        itens_por_categoria[cat].append({
            'loja': fatura['loja'],
            'valor': fatura['valor'],
            'data': fatura['data'],
        })
    for cat in itens_por_categoria:
        itens_por_categoria[cat].sort(key=lambda x: x['valor'], reverse=True)

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
        'regra_5030_20': regra_5030_20,
        'risco_concentracao': risco_concentracao,
        'itens_por_categoria': itens_por_categoria,
    }


def _gerar_insights_llm(ctx: dict, personalidade: str = None) -> list:
    """Chama o LLM para gerar insights personalizados com princípios financeiros reais."""
    if personalidade is None:
        personalidade = ctx.get('personalidade', 'calm')

    SYSTEM_PROMPTS = {
        'savage': """És a Verly, uma assistente financeira BRUTAL e sem filtros.
Analisa os dados financeiros e dá insights cortantes mas verdadeiros.
Cita estudos e princípios financeiros reais (regra 50/30/20, Latte Factor, Lei de Parkinson, etc.)
quando relevante para fundamentar as tuas observações.""",

        'sarcastic': """És a Verly, uma assistente financeira SARCÁSTICA e irónica.
Analisa os dados com ironia inteligente mas construtiva.
Usa referências a estudos financeiros reais com um toque irónico.""",

        'calm': """És a Verly, uma coach financeira certificada, empática e construtiva.
Analisa os dados financeiros com tom equilibrado.
Cita princípios financeiros reconhecidos (Warren Buffett, regra 50/30/20, Latte Factor, etc.)
de forma natural quando adicionam valor ao conselho.""",

        'pro': """És a Verly, um CFO pessoal analítico e rigoroso.
Analisa os dados com linguagem de negócio e rigor técnico.
Cita estudos académicos e frameworks financeiros reconhecidos (CFPB, Fed Reserve, etc.).""",
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
    regra_txt = ''
    if ctx['rendimento_mensal'] > 0:
        pct_rendimento = round((ctx['total_gasto_mes'] / ctx['rendimento_mensal']) * 100, 1)
        rendimento_txt = f"\nRendimento mensal: {ctx['rendimento_mensal']}€ (gastou {pct_rendimento}% do rendimento)"
        if ctx['regra_5030_20']:
            r = ctx['regra_5030_20']
            regra_txt = (
                f"\nRegra 50/30/20 aplicada ao rendimento de {ctx['rendimento_mensal']}€:"
                f"\n  - Necessidades (50%): ideal {r['necessidades_ideal']}€/mês"
                f"\n  - Desejos (30%): ideal {r['desejos_ideal']}€/mês"
                f"\n  - Poupança (20%): ideal {r['poupanca_ideal']}€/mês"
                f"\n  - Gasto atual: {r['gasto_atual']}€ = {r['pct_rendimento']}% do rendimento"
            )

    orcamento_txt = ''
    if ctx['orcamento_mensal'] > 0:
        pct_orc = round((ctx['total_gasto_mes'] / ctx['orcamento_mensal']) * 100, 1)
        orcamento_txt = f"\nOrçamento mensal definido: {ctx['orcamento_mensal']}€ ({pct_orc}% usado)"

    previsao_txt = ''
    if ctx['previsao_mensal']:
        previsao_txt = f"\nPrevisão de gasto até fim do mês: {ctx['previsao_mensal']}€ (baseado nos primeiros {ctx['dia_atual']} dias)"

    subscricoes_txt = ''
    if ctx['subscricoes_detetadas']:
        custo_anual = ctx['total_subscricoes'] * 12
        linhas = [f"  - {s['nome']}: ~{s['valor_mensal']}€/mês" for s in ctx['subscricoes_detetadas']]
        subscricoes_txt = (
            f"\nSubscrições detetadas (total: {ctx['total_subscricoes']}€/mês = {custo_anual:.0f}€/ano):\n"
            + '\n'.join(linhas)
        )

    concentracao_txt = ''
    if ctx['risco_concentracao']:
        r = ctx['risco_concentracao']
        concentracao_txt = f"\nALERTA: {r['pct']}% dos gastos concentrados em '{r['categoria']}' ({r['valor']}€)"

    top_cats_txt = '\n'.join([f"  - {c['categoria']}: {c['valor']}€" for c in ctx['top_categorias']])
    memoria_txt = ''
    if ctx.get('memoria_semantica'):
        linhas = []
        for item in ctx['memoria_semantica'][:6]:
            titulo = item.get('title') or item.get('merchant') or item.get('loja') or 'Registo'
            valor = item.get('amount')
            moeda = item.get('currency') or ctx.get('currency', 'EUR')
            categoria = item.get('categoria') or 'Outros'
            fonte = 'banco' if item.get('source_type') == 'bank_transaction' else 'fatura'
            valor_txt = f"{valor} {moeda}" if valor is not None else ''
            linhas.append(f"  - {fonte}: {titulo} | {valor_txt} | {categoria}")
        memoria_txt = '\nExemplos reais encontrados por memoria semantica:\n' + '\n'.join(linhas)

    user_prompt = f"""Dados financeiros de {ctx['nome']} este mês:

Total gasto: {ctx['total_gasto_mes']}€
Número de faturas: {ctx['num_faturas_mes']}
Objetivo do utilizador: {ctx['objetivo']}{rendimento_txt}{orcamento_txt}{variacao_txt}{previsao_txt}{regra_txt}

Top categorias de gasto:
{top_cats_txt}{metas_txt}{subscricoes_txt}{concentracao_txt}{memoria_txt}

Gera exatamente 5 insights personalizados e muito relevantes com base nestes dados reais.
Tipos: alerta, tendencia, positivo, dica, previsao.

Regras IMPORTANTES:
- Usa os valores reais dos dados (não inventes números)
- Sé específico — menciona categorias, valores, percentagens reais
- Para pelo menos 2 dos 5 insights, menciona um princípio financeiro real de forma natural
  (exemplos: regra 50/30/20 de Elizabeth Warren, Latte Factor de David Bach, Lei de Parkinson,
  fundo de emergência de 3-6 meses, efeito do juro composto, etc.)
- Se houver subscrições, calcula o impacto anual e comenta
- Se houver previsão de ultrapassar o orçamento, cria um insight de "alerta" específico
- Adapta o tom à personalidade: {personalidade}
- Se o gasto total for baixo/controlado, cria pelo menos 1 insight "positivo" genuíno
- Máximo 2-3 frases por insight, linguagem natural, não robótica

Responde APENAS com um array JSON válido, sem markdown, sem texto extra:
[
  {{
    "tipo": "alerta|tendencia|positivo|dica|previsao",
    "texto": "frase do insight (2-3 frases, tom adaptado, pode citar princípio financeiro)",
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
            max_tokens=1000,
            temperature=0.72,
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r'```json|```', '', raw).strip()
        insights = json.loads(raw)
        if isinstance(insights, list):
            return insights[:6]
        return []
    except Exception as e:
        logger.error(f'Erro ao gerar insights LLM: {e}')
        insights = []
        if ctx['total_gasto_mes'] > 0:
            insights.append({
                'tipo': 'dica',
                'texto': f"Gastaste {ctx['total_gasto_mes']}€ este mês em {ctx['num_faturas_mes']} compras. "
                         f"A regra 50/30/20 sugere destinar 20% do rendimento a poupança.",
                'valor': ctx['total_gasto_mes'],
            })
        if ctx['orcamento_mensal'] > 0 and ctx['total_gasto_mes'] > ctx['orcamento_mensal']:
            excesso = ctx['total_gasto_mes'] - ctx['orcamento_mensal']
            insights.append({
                'tipo': 'alerta',
                'texto': f"Ultrapassaste o teu orçamento de {ctx['orcamento_mensal']}€ em {excesso:.2f}€. "
                         f"A Lei de Parkinson diz que os gastos tendem a expandir para o rendimento disponível — um orçamento mais rígido pode ajudar.",
                'valor': excesso,
            })
        if ctx['previsao_mensal']:
            insights.append({
                'tipo': 'previsao',
                'texto': f"Ao ritmo atual, vais gastar cerca de {ctx['previsao_mensal']}€ este mês.",
                'valor': ctx['previsao_mensal'],
            })
        if ctx['total_subscricoes'] > 0:
            custo_anual = ctx['total_subscricoes'] * 12
            insights.append({
                'tipo': 'alerta',
                'texto': f"As tuas subscrições custam {ctx['total_subscricoes']}€/mês = {custo_anual:.0f}€/ano. "
                         f"O Latte Factor de David Bach mostra como pequenos gastos recorrentes têm grande impacto a longo prazo.",
                'valor': ctx['total_subscricoes'],
            })
        if ctx['variacao_pct'] is not None and ctx['variacao_pct'] < 0:
            insights.append({
                'tipo': 'positivo',
                'texto': f"Gastaste {abs(ctx['variacao_pct'])}% menos que o mês anterior. Excelente progresso!",
                'valor': None,
            })
        return insights[:5]


# Alias para as tasks Celery
_gerar_insights_com_llm = _gerar_insights_llm


# ── GET /api/v1/insights ──────────────────────────────────────────────────────

@api_bp.route('/insights', methods=['GET'])
@jwt_required()
def get_insights():
    """
    Gera insights personalizados com IA.
    - Se existir cache Redis: serve imediatamente (200)
    - Se não existir: dispara task Celery em background e retorna 202
    - O cliente deve fazer retry em 10s
    """
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'message': 'Utilizador não encontrado.'}), 404

    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'

    cache_key = f'insights:{user_id}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    # Cache miss — disparar task Celery em background
    try:
        from app.tasks.ai_insights import gerar_insights_task
        gerar_insights_task.delay(user_id)
        return jsonify({
            'success': False,
            'status': 'a_calcular',
            'message': 'Os insights estão a ser calculados. Tenta novamente em 10 segundos.',
            'retry_in': 10,
        }), 202
    except Exception:
        pass

    # Fallback síncrono se Celery não estiver disponível
    ctx = _build_context(user_id)
    insights = _gerar_insights_llm(ctx, personalidade)

    result = {
        'success': True,
        'insights': insights,
        'resumo': {
            'total_gasto':         ctx['total_gasto_mes'],
            'num_faturas':         ctx['num_faturas_mes'],
            'variacao_pct':        ctx['variacao_pct'],
            'variacao_subiu':      (ctx['variacao_pct'] or 0) > 0,
            'orcamento_mensal':    ctx['orcamento_mensal'],
            'rendimento_mensal':   ctx['rendimento_mensal'],
            'pct_orcamento':       round((ctx['total_gasto_mes'] / ctx['orcamento_mensal'] * 100), 1)
                                   if ctx['orcamento_mensal'] > 0 else None,
            'pct_rendimento':      round((ctx['total_gasto_mes'] / ctx['rendimento_mensal'] * 100), 1)
                                   if ctx['rendimento_mensal'] > 0 else None,
            'top_categorias':      ctx['top_categorias'],
            'metas':               ctx['metas'],
            'previsao_mensal':     ctx['previsao_mensal'],
            'subscricoes':         ctx['subscricoes_detetadas'],
            'total_subscricoes':   ctx['total_subscricoes'],
            'historico_mensal':    ctx['historico_mensal'],
            'regra_5030_20':       ctx['regra_5030_20'],
            'itens_por_categoria': ctx['itens_por_categoria'],
            'memoria_semantica':   ctx.get('memoria_semantica', []),
            'financial_intelligence': ctx['financial_intelligence'],
        },
        'financial_intelligence': ctx['financial_intelligence'],
        'memoria_semantica': ctx.get('memoria_semantica', []),
        'personalidade': personalidade,
        'sem_dados': ctx['num_faturas_mes'] == 0 and ctx['total_gasto_mes'] == 0,
    }
    return jsonify(result)


# ── GET /api/v1/poupanca ──────────────────────────────────────────────────────

@api_bp.route('/poupanca', methods=['GET'])
@jwt_required()
def get_poupanca():
    """
    Gera um plano de poupança personalizado e concreto com base nos dados reais.
    """
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': 'Utilizador não encontrado.'}), 404

    personalidade = getattr(user, 'personalidade', 'calm') or 'calm'
    ctx = _build_context(user_id)

    if ctx['total_gasto_mes'] == 0 and ctx['num_faturas_mes'] == 0:
        return jsonify({
            'success': True,
            'sem_dados': True,
            'poupanca_possivel': None,
            'sugestao': None,
            'breakdown': [],
        })

    orcamento    = ctx['orcamento_mensal']
    rendimento   = ctx['rendimento_mensal']
    gasto_atual  = ctx['total_gasto_mes']
    subscricoes  = ctx['total_subscricoes']
    previsao     = ctx['previsao_mensal'] or gasto_atual
    top_cats     = ctx['top_categorias']

    if orcamento > 0:
        poupanca_possivel = max(0, orcamento - previsao)
    elif rendimento > 0:
        poupanca_possivel = max(0, rendimento * 0.20)
    else:
        poupanca_possivel = None

    categorias_cortaveis = {'lazer', 'restaurantes', 'vestuário', 'takeaway',
                             'entretenimento', 'outros', 'compras'}
    breakdown = []
    for cat_item in top_cats[:4]:
        cat   = cat_item['categoria']
        valor = cat_item['valor']
        pct_corte = 0.20 if cat.lower() in categorias_cortaveis else 0.10
        economia = round(valor * pct_corte, 2)
        if economia > 0:
            breakdown.append({
                'categoria': cat,
                'gasto_atual': round(valor, 2),
                'corte_sugerido_pct': int(pct_corte * 100),
                'economia_mensal': economia,
                'economia_anual': round(economia * 12, 2),
            })

    top_cats_txt  = '\n'.join([f"  - {c['categoria']}: {c['valor']}€" for c in top_cats])
    historico_txt = ', '.join([f"{h['mes']}: {h['valor']}€" for h in ctx['historico_mensal']])

    subscricoes_txt = ''
    if ctx['subscricoes_detetadas']:
        subs = ', '.join([f"{s['nome']} ({s['valor_mensal']}€/mês)" for s in ctx['subscricoes_detetadas']])
        subscricoes_txt = f"\nSubscrições recorrentes detetadas: {subs} = {subscricoes}€/mês = {subscricoes*12:.0f}€/ano"

    metas_txt = ''
    if ctx['metas']:
        metas_ultrapassadas = [m for m in ctx['metas'] if m['ultrapassou']]
        if metas_ultrapassadas:
            metas_txt = '\nMetas ultrapassadas: ' + ', '.join([
                f"{m['categoria']} ({m['gasto']}€/{m['limite']}€)" for m in metas_ultrapassadas
            ])

    regra_txt = ''
    if ctx['regra_5030_20']:
        r = ctx['regra_5030_20']
        regra_txt = (
            f"\nRegra 50/30/20 aplicada (rendimento {rendimento}€):"
            f" necessidades ideal {r['necessidades_ideal']}€,"
            f" desejos ideal {r['desejos_ideal']}€,"
            f" poupança ideal {r['poupanca_ideal']}€."
            f" Atualmente a gastar {r['pct_rendimento']}% do rendimento."
        )

    PERSONALITY_TONE = {
        'savage':    'Tom direto e cortante. Diz exatamente onde o dinheiro está a ser desperdiçado.',
        'sarcastic': 'Tom irónico mas construtivo. Usa ironia inteligente sobre os padrões de gasto.',
        'calm':      'Tom empático e motivador. Foca no progresso possível.',
        'pro':       'Tom analítico e rigoroso. Usa linguagem financeira precisa.',
    }
    tone = PERSONALITY_TONE.get(personalidade, PERSONALITY_TONE['calm'])

    prompt = f"""És a Verly, uma IA financeira pessoal com acesso aos dados reais do utilizador.

DADOS REAIS DO UTILIZADOR:
- Gasto este mês: {gasto_atual}€ em {ctx['num_faturas_mes']} faturas
- Previsão fim do mês: {previsao}€
- Orçamento definido: {orcamento}€ {'(ULTRAPASSADO)' if orcamento > 0 and previsao > orcamento else ''}
- Rendimento mensal: {rendimento}€
- Histórico últimos 6 meses: {historico_txt}
{regra_txt}

Top categorias de gasto este mês:
{top_cats_txt}{subscricoes_txt}{metas_txt}

{'Variação vs mês anterior: ' + ('+' if (ctx['variacao_pct'] or 0) > 0 else '') + str(ctx['variacao_pct']) + '%' if ctx['variacao_pct'] is not None else ''}

TAREFA: Cria um plano de poupança CONCRETO e ACIONÁVEL para este utilizador.
- Usa os dados reais (não inventes valores)
- Identifica os 2-3 maiores desperdícios com valores específicos
- Dá uma sugestão principal clara e acionável
- Menciona o impacto anual se cortar nessas categorias
- Se tiver subscrições, calcula o impacto de cancelar as menos usadas
- Cita 1 princípio financeiro real se fizer sentido (regra 50/30/20, Latte Factor, etc.)
- {tone}
- Máximo 3-4 frases. Direto ao ponto. Português de Portugal.

Responde APENAS com JSON válido:
{{
  "sugestao": "texto principal da sugestão (3-4 frases, concreto, com valores reais)",
  "poupanca_estimada_mensal": número (quanto pode poupar por mês realisticamente),
  "poupanca_estimada_anual": número (impacto anual),
  "foco_principal": "nome da categoria onde deve cortar mais"
}}"""

    try:
        import os
        from groq import Groq
        client = Groq(api_key=os.getenv('GROQ_API_KEY', ''))
        response = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=400,
            temperature=0.65,
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r'```json|```', '', raw).strip()
        resultado = json.loads(raw)
    except Exception as e:
        logger.error(f'Erro poupanca LLM: {e}')
        foco = top_cats[0]['categoria'] if top_cats else 'geral'
        economia_mensal = round(top_cats[0]['valor'] * 0.20, 2) if top_cats else 0
        resultado = {
            'sugestao': (
                f"Com base nos teus padrões, podes poupar cortando 20% em {foco} "
                f"({economia_mensal}€/mês). "
                f"{'As tuas subscrições custam ' + str(subscricoes) + '€/mês = ' + str(round(subscricoes*12)) + '€/ano — vale a pena rever.' if subscricoes > 0 else ''}"
            ).strip(),
            'poupanca_estimada_mensal': economia_mensal,
            'poupanca_estimada_anual': round(economia_mensal * 12, 2),
            'foco_principal': foco,
        }

    return jsonify({
        'success': True,
        'sem_dados': False,
        'poupanca_possivel': poupanca_possivel,
        'sugestao': resultado.get('sugestao'),
        'poupanca_estimada_mensal': resultado.get('poupanca_estimada_mensal'),
        'poupanca_estimada_anual': resultado.get('poupanca_estimada_anual'),
        'foco_principal': resultado.get('foco_principal'),
        'breakdown': breakdown,
        'contexto': {
            'gasto_atual': gasto_atual,
            'previsao': previsao,
            'orcamento': orcamento,
            'rendimento': rendimento,
            'total_subscricoes': subscricoes,
        },
    })
