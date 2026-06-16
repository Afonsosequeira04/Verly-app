from datetime import datetime

from app.financial_records import normalize_text


def _money(value):
    return round(float(value or 0), 2)


def _source_label(source):
    if source == 'open_banking':
        return 'Banco'
    if source == 'fatura':
        return 'Faturas'
    return source or 'Fonte'


def _top_category(summary):
    categories = (
        summary.get('mes_atual', {}).get('por_categoria')
        or summary.get('por_categoria')
        or []
    )
    if not categories:
        return None
    item = categories[0]
    total = item.get('valor', item.get('total', 0))
    return {
        'categoria': item.get('categoria') or 'Outros',
        'total': _money(total),
        'currency': item.get('currency') or summary.get('currency', 'EUR'),
    }


def _data_quality(summary):
    sources = summary.get('fontes') or []
    records = int(summary.get('num_registos') or 0)
    bank_count = sum(int(item.get('count') or 0) for item in sources if item.get('fonte') == 'open_banking')
    invoice_count = sum(int(item.get('count') or 0) for item in sources if item.get('fonte') == 'fatura')
    converted = summary.get('conversion') or {}
    excluded = summary.get('excluded') or {}

    source_score = 34 if bank_count else 0
    source_score += 18 if invoice_count else 0
    volume_score = min(28, records * 2)
    cleanup_score = 20 if int(excluded.get('count') or 0) > 0 else 10
    score = min(100, source_score + volume_score + cleanup_score)

    if records == 0:
        label = 'Sem dados'
    elif score >= 75:
        label = 'Alta confianca'
    elif score >= 45:
        label = 'Confianca media'
    else:
        label = 'Poucos dados'

    return {
        'score': score,
        'label': label,
        'records': records,
        'bank_records': bank_count,
        'invoice_records': invoice_count,
        'converted_count': int(converted.get('converted_count') or 0),
        'excluded_count': int(excluded.get('count') or 0),
        'sources': [
            {
                'label': _source_label(item.get('fonte')),
                'total': _money(item.get('total')),
                'count': int(item.get('count') or 0),
                'currency': item.get('currency') or summary.get('currency', 'EUR'),
            }
            for item in sources
        ],
    }


def _budget_context(summary, budget_summary, user):
    budget = _money(getattr(user, 'orcamento_mensal', 0) or 0)
    current = _money((budget_summary or summary).get('mes_atual', {}).get('total'))
    forecast = (budget_summary or summary).get('previsao_mensal')
    currency = (budget_summary or summary).get('currency') or 'EUR'
    pct = round((current / budget) * 100, 1) if budget > 0 else None
    forecast_pct = round((float(forecast or 0) / budget) * 100, 1) if budget > 0 and forecast else None

    if budget <= 0:
        status = 'missing'
    elif current > budget:
        status = 'over'
    elif forecast and forecast > budget:
        status = 'forecast_over'
    elif pct is not None and pct >= 80:
        status = 'watch'
    else:
        status = 'ok'

    return {
        'budget': budget,
        'spent': current,
        'remaining': _money(budget - current) if budget > 0 else None,
        'forecast': _money(forecast) if forecast else None,
        'pct': pct,
        'forecast_pct': forecast_pct,
        'currency': currency,
        'status': status,
    }


def _subscription_context(subs_data, currency):
    subs = (subs_data or {}).get('subscriptions') or []
    risky = [
        item for item in subs
        if item.get('risk') in ('danger', 'warning', 'high')
    ]
    monthly = sum(float(item.get('preco_mensal') or 0) for item in risky)
    return {
        'count': len(subs),
        'risk_count': len(risky),
        'monthly_risk': _money(monthly),
        'annual_risk': _money(monthly * 12),
        'currency': risky[0].get('currency') if risky else currency,
        'top': risky[:3],
    }


def _health_score(summary, budget, subs, quality):
    score = 100
    if budget['status'] == 'over':
        score -= 28
    elif budget['status'] == 'forecast_over':
        score -= 20
    elif budget['status'] == 'watch':
        score -= 10
    elif budget['status'] == 'missing':
        score -= 8

    variance = summary.get('variacao_pct')
    if variance is not None:
        if variance > 35:
            score -= 16
        elif variance > 15:
            score -= 8
        elif variance < -10:
            score += 5

    if subs['risk_count'] >= 3:
        score -= 14
    elif subs['risk_count']:
        score -= 7

    top = _top_category(summary)
    total = float(summary.get('mes_atual', {}).get('total') or summary.get('total_geral') or 0)
    if top and total > 0 and top['total'] / total > 0.45:
        score -= 10

    if quality['score'] < 45:
        score -= 8

    return max(0, min(100, int(round(score))))


def _next_actions(summary, budget, subs, quality):
    actions = []
    currency = summary.get('currency', 'EUR')
    top = _top_category(summary)

    if budget['status'] in ('over', 'forecast_over'):
        actions.append({
            'id': 'budget_pressure',
            'priority': 'critical',
            'title': 'Rever orcamento agora',
            'body': 'A previsao indica que podes passar o limite mensal. Comeca pela categoria com maior peso.',
            'metric': budget.get('forecast') or budget.get('spent'),
            'currency': budget.get('currency'),
            'route': 'Metas',
        })
    elif budget['status'] == 'missing':
        actions.append({
            'id': 'create_budget',
            'priority': 'high',
            'title': 'Criar orcamento real',
            'body': 'Define um limite mensal para a app transformar gastos reais em alertas uteis.',
            'metric': None,
            'currency': currency,
            'route': 'Metas',
        })

    if subs['risk_count']:
        actions.append({
            'id': 'subscription_audit',
            'priority': 'high',
            'title': 'Auditar subscricoes',
            'body': f'{subs["risk_count"]} pagamentos recorrentes merecem revisao antes de renovarem.',
            'metric': subs['annual_risk'],
            'currency': subs.get('currency') or currency,
            'route': 'MinhasSubscricoes',
        })

    if top and top['total'] > 0:
        actions.append({
            'id': 'top_category',
            'priority': 'medium',
            'title': f'Dominar {top["categoria"]}',
            'body': 'Esta categoria esta a liderar os gastos. Ve os movimentos antes de criares um corte.',
            'metric': top['total'],
            'currency': top['currency'],
            'route': 'Estatisticas',
        })

    if quality['bank_records'] == 0 and quality['invoice_records'] == 0:
        actions.append({
            'id': 'import_sources',
            'priority': 'high',
            'title': 'Ligar fontes reais',
            'body': 'Importa Gmail ou banco para o cockpit deixar de trabalhar com dados incompletos.',
            'metric': None,
            'currency': currency,
            'route': 'ImportarDados',
        })
    elif quality['bank_records'] == 0:
        actions.append({
            'id': 'connect_bank',
            'priority': 'medium',
            'title': 'Ligar banco',
            'body': 'Com Open Banking, a Verly passa a apanhar subscricoes e gastos esquecidos automaticamente.',
            'metric': None,
            'currency': currency,
            'route': 'ImportarDados',
        })

    if subs['count'] == 0 and (quality['bank_records'] or quality['invoice_records']):
        actions.append({
            'id': 'detect_subscriptions',
            'priority': 'medium',
            'title': 'Detetar subscricoes',
            'body': 'Ja ha fontes suficientes para procurar pagamentos recorrentes com mais contexto.',
            'metric': None,
            'currency': currency,
            'route': 'MinhasSubscricoes',
        })

    if quality['records'] > 0:
        actions.append({
            'id': 'live_deals_next_purchase',
            'priority': 'low',
            'title': 'Comparar proxima compra',
            'body': 'Antes de comprares, compara preco online, lojas perto, urgencia e orcamento.',
            'metric': None,
            'currency': currency,
            'route': 'LiveDeals',
        })

    if quality['records'] > 0:
        actions.append({
            'id': 'refund_radar',
            'priority': 'medium',
            'title': 'Procurar dinheiro recuperavel',
            'body': 'Ve devolucoes, duplicados, subscricoes e possiveis price drops nas compras recentes.',
            'metric': None,
            'currency': currency,
            'route': 'RefundRadar',
        })

    actions.append({
        'id': 'bill_planner',
        'priority': 'low',
        'title': 'Planear proximos pagamentos',
        'body': 'Regista contas e obrigacoes para a Verly avisar antes do prazo.',
        'metric': None,
        'currency': currency,
        'route': 'Bills',
    })

    if quality['records'] > 0:
        actions.append({
            'id': 'live_deals_score',
            'priority': 'low',
            'title': 'Analisar compra no Live Deals',
            'body': 'Compara preco, lojas perto, urgencia, uso e orcamento antes de comprares.',
            'metric': None,
            'currency': currency,
            'route': 'LiveDeals',
        })

    if quality['records'] > 0:
        actions.append({
            'id': 'networth_review',
            'priority': 'low',
            'title': 'Atualizar patrimonio',
            'body': 'Regista ativos e dividas para veres se o mes esta a aumentar ou a reduzir o teu net worth.',
            'metric': None,
            'currency': currency,
            'route': 'NetWorth',
        })

    if quality['converted_count'] > 0:
        actions.append({
            'id': 'currency_review',
            'priority': 'low',
            'title': 'Confirmar moeda de leitura',
            'body': f'{quality["converted_count"]} movimentos foram convertidos para a moeda atual.',
            'metric': quality['converted_count'],
            'currency': None,
            'route': 'Estatisticas',
        })

    order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    actions.sort(key=lambda item: order.get(item['priority'], 9))
    return actions[:5]


def _budget_recommendations(summary):
    categories = summary.get('por_categoria') or []
    currency = summary.get('currency', 'EUR')
    recommendations = []
    for item in categories[:4]:
        value = float(item.get('total') or item.get('valor') or 0)
        if value <= 0:
            continue
        recommendations.append({
            'categoria': item.get('categoria') or 'Outros',
            'current': _money(value),
            'suggested_limit': _money(max(value * 0.9, value - 25)),
            'potential_saving': _money(min(value * 0.1, 25 if value < 250 else value * 0.12)),
            'currency': item.get('currency') or currency,
        })
    return recommendations


def _social_challenges(summary, subs):
    suggestions = []
    top = _top_category(summary)
    currency = summary.get('currency', 'EUR')
    if top and top['total'] > 0:
        suggestions.append({
            'type': 'dividir_categoria',
            'title': f'Dividir despesas de {top["categoria"]}',
            'description': 'Se forem gastos partilhados, cria um grupo e evita acertos por fora.',
            'category': top['categoria'],
            'target': _money(top['total']),
            'currency': top['currency'],
            'days': 7,
        })
    if subs['risk_count']:
        suggestions.append({
            'type': 'auditar_subscricoes',
            'title': 'Auditoria de subscricoes',
            'description': 'Reve pagamentos recorrentes e decide o que manter antes da renovacao.',
            'category': None,
            'target': _money(max(subs['monthly_risk'], 20)),
            'currency': subs.get('currency') or currency,
            'days': 1,
        })
    suggestions.append({
        'type': 'grupo_partilhado',
        'title': 'Criar grupo partilhado',
        'description': 'Usa grupos para viagens, casa ou jantares e deixa a app calcular acertos.',
        'category': None,
        'target': 0,
        'currency': currency,
        'days': 1,
    })
    return suggestions[:3]


def build_financial_intelligence(user, summary, budget_summary=None, subs_data=None):
    budget_summary = budget_summary or summary
    currency = summary.get('currency', 'EUR')
    quality = _data_quality(summary)
    budget = _budget_context(summary, budget_summary, user)
    subs = _subscription_context(subs_data, currency)
    score = _health_score(summary, budget, subs, quality)
    top = _top_category(summary)
    actions = _next_actions(summary, budget, subs, quality)

    if score >= 80:
        headline = 'Financas sob controlo'
    elif score >= 60:
        headline = 'Bom momento para afinar'
    elif score >= 40:
        headline = 'Ha sinais para corrigir'
    else:
        headline = 'Plano de acao recomendado'

    primary = actions[0] if actions else {
        'id': 'keep_tracking',
        'priority': 'low',
        'title': 'Continuar a acompanhar',
        'body': 'Os dados atuais nao mostram um alerta principal. Mantem o registo atualizado.',
        'route': 'Estatisticas',
    }

    return {
        'generated_at': datetime.utcnow().isoformat(),
        'headline': headline,
        'score': score,
        'currency': currency,
        'primary_action': primary,
        'next_actions': actions,
        'data_quality': quality,
        'budget': budget,
        'subscriptions': subs,
        'top_category': top,
        'budget_recommendations': _budget_recommendations(summary),
        'social_challenges': _social_challenges(summary, subs),
        'signals': {
            'trend_pct': summary.get('variacao_pct'),
            'forecast': summary.get('previsao_mensal'),
            'excluded_movements': quality['excluded_count'],
            'dominant_category': normalize_text(top['categoria']) if top else None,
        },
    }
