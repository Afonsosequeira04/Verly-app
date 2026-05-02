import json
import random
from datetime import datetime, timedelta
from collections import defaultdict
from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.models import Fatura, Conversa, Meta
from app.subscriptions import detect_subscriptions
from app import db

dashboard_bp = Blueprint('dashboard', __name__)

# ── #6 FIX: mapeamento canónico de personalidades ─────────────────────────────
# O onboarding e o perfil guardam 'savage','sarcastic','calm','pro'.
# Versões antigas guardavam 'strict' ou 'friendly' — mapeamos para o equivalente.
PERSONALITY_MAP = {
    'savage':    'savage',
    'sarcastic': 'sarcastic',
    'calm':      'calm',
    'pro':       'pro',
    'strict':    'pro',       # alias legacy → pro
    'friendly':  'calm',      # alias legacy → calm
    'rebel':     'savage',    # alias legacy → savage
}

def _normalise_personality(p):
    return PERSONALITY_MAP.get(p or 'calm', 'calm')


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def _calcular_mood(total_gasto, orcamento, num_alertas, personalidade):
    p = _normalise_personality(personalidade)   # #6 fix
    ratio = (total_gasto / orcamento) if orcamento and orcamento > 0 else None

    if ratio is None:       nivel = 'ok'
    elif ratio < 0.5:       nivel = 'great'
    elif ratio < 0.8:       nivel = 'ok'
    elif ratio < 1.0:       nivel = 'meh'
    else:                   nivel = 'bad'

    if num_alertas >= 3:
        nivel = 'bad'

    frases = {
        'calm': {
            'great': ["Estás no bom caminho. Continua assim.", "Os números estão tranquilos. Bom trabalho.", "Tudo equilibrado. Boa semana."],
            'ok':    ["Dentro do razoável. Mantém o ritmo.", "Está bem, mas podes melhorar.", "Nada de alarme, mas atenção."],
            'meh':   ["A chegar perto do limite. Cuidado.", "Pensa bem antes da próxima compra.", "O orçamento está a esticar."],
            'bad':   ["Ultrapassaste o orçamento. Respira.", "Hora de parar e avaliar os gastos.", "O mês foi pesado. Faz uma pausa."],
        },
        'pro': {
            'great': ["Excelente disciplina financeira.", "Abaixo do orçamento. Como deve ser.", "Perfeito. Não baixes a guarda."],
            'ok':    ["Aceitável. Mas podes fazer melhor.", "Não é mau, mas não é bom.", "Atenção ao padrão de gastos."],
            'meh':   ["Isto não está bem. Corrige já.", "Estás a aproximar-te demais do limite.", "Foca-te. O orçamento não é sugestão."],
            'bad':   ["Falhaste o orçamento. Sem desculpas.", "Gastos fora de controlo. Trata disto.", "Isto não pode voltar a acontecer."],
        },
        'savage': {
            'great': ["Ok, impressionante. Não esperava.", "Gastaste pouco. Estranho, mas bom.", "Poupança desbloqueada. Nível up."],
            'ok':    ["Podias ter feito pior. Ou melhor.", "Aceitável. Mas não te iludas.", "Dentro dos limites. Por enquanto."],
            'meh':   ["A andar para o precipício. Cuidado.", "Quase lá... no pior sentido.", "Vais mesmo fazer isso? Pensa bem."],
            'bad':   ["Bom, rebentas-te o orçamento. Clássico.", "Dinheiro evaporado. Parabéns.", "O orçamento ligou. Não estava bem."],
        },
        'sarcastic': {
            'great': ["Uau, estás a arrasar! 🌟", "Que semana incrível, continua assim! 🎉", "Orgulhosa de ti! Os gastos estão óptimos."],
            'ok':    ["Está tudo bem, nada a preocupar 😊", "Vais bem! Só mantém o olho no orçamento.", "Tudo certo por aqui, boa semana!"],
            'meh':   ["Atenção, estamos a aproximar do limite 😅", "Calma nos gastos, vai correr tudo bem!", "Quase no limite... respira e pensa!"],
            'bad':   ["Ai ai, ultrapassámos o orçamento 😬", "Não te preocupes, recuperamos no próximo mês!", "Vamos reajustar o plano juntos? 💪"],
        },
    }

    frase = random.choice(frases[p][nivel])
    cores = {'great': '#00D68F', 'ok': '#534AB7', 'meh': '#FFB800', 'bad': '#FF4757'}
    icons = {'great': '😊', 'ok': '🙂', 'meh': '😐', 'bad': '😤'}

    return {'nivel': nivel, 'frase': frase, 'cor': cores[nivel], 'icon': icons[nivel]}


def _atualizar_streak(user, faturas, orcamento):
    hoje = datetime.now().date()
    ALTO_ARREPENDIMENTO = {'Entretenimento', 'Vestuário', 'Outros'}

    gastos_por_dia = defaultdict(float)
    cats_por_dia   = defaultdict(set)
    for f in faturas:
        data = _parse_date(f.data_compra) or f.data_upload
        if data:
            d = data.date() if hasattr(data, 'date') else data
            gastos_por_dia[d] += f.total or 0
            cats_por_dia[d].add(f.categoria or 'Outros')

    gastos_mes = defaultdict(float)
    for f in faturas:
        data = _parse_date(f.data_compra) or f.data_upload
        if data:
            d = data.date() if hasattr(data, 'date') else data
            gastos_mes[(d.year, d.month)] += f.total or 0

    def dia_e_impulsivo(d):
        if d not in gastos_por_dia:
            return False
        chave_mes = (d.year, d.month)
        if orcamento and orcamento > 0 and gastos_mes[chave_mes] > orcamento:
            return True
        for f in faturas:
            if f.categoria not in ALTO_ARREPENDIMENTO or f.data_garantia:
                continue
            raw = _parse_date(f.data_compra) or f.data_upload
            if raw is None:
                continue
            fd = raw.date() if hasattr(raw, 'date') else raw
            if fd == d:
                return True
        return False

    ultima        = user.streak_ultima_atualizacao.date() if user.streak_ultima_atualizacao else None
    streak_atual  = user.streak_dias or 0

    if ultima == hoje:
        if dia_e_impulsivo(hoje):
            user.streak_dias = 0
    else:
        if dia_e_impulsivo(hoje):
            user.streak_dias = 0
        elif ultima is None:
            user.streak_dias = 1
        elif ultima == hoje - timedelta(days=1):
            user.streak_dias = streak_atual + 1
        else:
            dias_em_falta = (hoje - ultima).days
            houve = any(dia_e_impulsivo(ultima + timedelta(days=i)) for i in range(1, dias_em_falta + 1))
            user.streak_dias = 0 if houve else streak_atual + dias_em_falta

    user.streak_ultima_atualizacao = datetime.now()
    db.session.commit()
    return user.streak_dias


def _evolucao_mensal_real(faturas):
    MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    hoje  = datetime.now()
    meses = []
    for i in range(5, -1, -1):
        mes = hoje.month - i
        ano = hoje.year
        while mes <= 0:
            mes += 12; ano -= 1
        meses.append((ano, mes))

    totais = defaultdict(float)
    for f in faturas:
        data = _parse_date(f.data_compra) or f.data_upload
        if data:
            totais[(data.year, data.month)] += f.total or 0

    labels = [MESES_PT[m - 1] for (_, m) in meses]
    values = [round(totais.get((a, m), 0), 2) for (a, m) in meses]
    return labels, values


# ── #7 Comparação mês a mês ───────────────────────────────────────────────────
def _comparacao_mensal(faturas):
    """
    Devolve um dict com:
      - variacao_pct: % de mudança vs mês anterior (float, pode ser None)
      - variacao_valor: diferença em € (float)
      - mes_atual_total: total do mês atual
      - mes_anterior_total: total do mês anterior
      - top_cat_delta: categoria com maior aumento vs mês anterior
    """
    hoje    = datetime.now()
    mes_a   = (hoje.year, hoje.month)
    prev_m  = hoje.month - 1
    prev_y  = hoje.year
    if prev_m <= 0:
        prev_m += 12; prev_y -= 1
    mes_p   = (prev_y, prev_m)

    totais_mes = defaultdict(float)
    cats_mes_a  = defaultdict(float)
    cats_mes_p  = defaultdict(float)

    for f in faturas:
        data = _parse_date(f.data_compra) or f.data_upload
        if not data:
            continue
        chave = (data.year, data.month)
        totais_mes[chave] += f.total or 0
        cat = f.categoria or 'Outros'
        if chave == mes_a:
            cats_mes_a[cat] += f.total or 0
        elif chave == mes_p:
            cats_mes_p[cat] += f.total or 0

    total_a = totais_mes.get(mes_a, 0)
    total_p = totais_mes.get(mes_p, 0)

    if total_p > 0:
        variacao_pct   = round(((total_a - total_p) / total_p) * 100, 1)
        variacao_valor = round(total_a - total_p, 2)
    else:
        variacao_pct   = None
        variacao_valor = 0

    # Categoria com maior delta absoluto
    all_cats = set(cats_mes_a.keys()) | set(cats_mes_p.keys())
    top_cat_delta = None
    top_delta_val = 0
    for cat in all_cats:
        delta = cats_mes_a.get(cat, 0) - cats_mes_p.get(cat, 0)
        if abs(delta) > abs(top_delta_val):
            top_delta_val = delta
            top_cat_delta = cat

    return {
        'variacao_pct':       variacao_pct,
        'variacao_valor':     variacao_valor,
        'mes_atual_total':    round(total_a, 2),
        'mes_anterior_total': round(total_p, 2),
        'top_cat_delta':      top_cat_delta,
        'top_cat_delta_val':  round(top_delta_val, 2),
        'subiu':              variacao_pct is not None and variacao_pct > 0,
        'desceu':             variacao_pct is not None and variacao_pct < 0,
    }


def _get_metas_dashboard(user_id):
    from app.metas import get_gastos_mes_atual
    metas = Meta.query.filter_by(user_id=user_id).all()
    if not metas:
        return None
    gastos = get_gastos_mes_atual(user_id)
    alerta, ultrapassadas = [], []
    ok_count = 0
    for m in metas:
        gasto = gastos.get(m.categoria, 0)
        pct   = round((gasto / m.valor_limite) * 100) if m.valor_limite > 0 else 0
        sobra = max(m.valor_limite - gasto, 0)
        entry = {
            'categoria': m.categoria, 'limite': m.valor_limite,
            'gasto': round(gasto, 2), 'pct': min(pct, 100),
            'sobra': round(sobra, 2), 'ultrapassou': gasto > m.valor_limite,
        }
        if gasto > m.valor_limite:       ultrapassadas.append(entry)
        elif pct >= 80:                  alerta.append(entry)
        else:                            ok_count += 1
    return {'alerta': alerta[:3], 'ultrapassadas': ultrapassadas[:3],
            'ok_count': ok_count, 'total': len(metas)}


def _gerar_feed_verly(faturas, conversas, orcamento, subs_data, personalidade, metas_info=None):
    p    = _normalise_personality(personalidade)   # #6 fix
    feed = []
    hoje = datetime.now()

    if metas_info and metas_info['ultrapassadas']:
        m = metas_info['ultrapassadas'][0]
        feed.append({'icone': '🔴',
            'texto': f"Ultrapassaste o limite de {m['categoria']}: gastaste {m['gasto']:.0f}€ de {m['limite']:.0f}€.",
            'tipo': 'alerta'})

    if metas_info and metas_info['alerta']:
        m = metas_info['alerta'][0]
        feed.append({'icone': '⚠️',
            'texto': f"{m['categoria']} a {m['pct']}% do limite — só sobram {m['sobra']:.0f}€ este mês.",
            'tipo': 'alerta'})

    for f in faturas:
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje and (data_gar - hoje).days <= 30:
            dias = (data_gar - hoje).days
            feed.append({'icone': '🛡',
                'texto': f"A garantia de {f.loja or f.nome_ficheiro} expira em {dias} dias.",
                'tipo': 'alerta'})
            break

    dias_semana = defaultdict(int)
    for f in faturas:
        data = _parse_date(f.data_compra)
        if data: dias_semana[data.weekday()] += 1
    if dias_semana:
        dia_top = max(dias_semana, key=dias_semana.get)
        nomes = ['segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado','domingo']
        if dias_semana[dia_top] >= 2:
            feed.append({'icone': '📅',
                'texto': f"Reparei que compras mais à {nomes[dia_top]}. Coincidência?",
                'tipo': 'insight'})

    cats = defaultdict(float)
    for f in faturas:
        cats[f.categoria or 'Outros'] += f.total or 0
    if cats:
        cat_top = max(cats, key=cats.get)
        val_top = cats[cat_top]
        if val_top > 50:
            feed.append({'icone': '💸',
                'texto': f"Já gastaste {val_top:.0f}€ em {cat_top}. É a tua maior categoria este mês.",
                'tipo': 'info'})

    if subs_data['count_danger'] > 0:
        feed.append({'icone': '⚠️',
            'texto': f"Tens {subs_data['count_danger']} subscrição(ões) que talvez não uses. São {subs_data['total_mensal_desperdicado']:.0f}€/mês a fugir.",
            'tipo': 'alerta'})

    total = sum(f.total or 0 for f in faturas)
    if orcamento and orcamento > 0:
        perc = (total / orcamento) * 100
        if perc >= 80:
            feed.append({'icone': '🔴', 'texto': f"Já usaste {perc:.0f}% do orçamento mensal.", 'tipo': 'alerta'})
        elif perc < 40:
            feed.append({'icone': '✅', 'texto': f"Só {perc:.0f}% do orçamento usado. Estás a controlar bem.", 'tipo': 'positivo'})

    if metas_info and metas_info['ok_count'] == metas_info['total'] > 0:
        feed.append({'icone': '🏆',
            'texto': f"Todas as {metas_info['total']} metas dentro do limite. Continua assim!",
            'tipo': 'positivo'})

    if faturas:
        ultima = max((f.data_upload for f in faturas), default=None)
        if ultima and (hoje - ultima).days > 14:
            feed.append({'icone': '🤔',
                'texto': "Há mais de 2 semanas sem novas faturas. Compraste e não registaste?",
                'tipo': 'info'})

    fallbacks = {
        'calm':      "Tudo tranquilo por aqui. Continua a registar as tuas compras.",
        'pro':       "Mantém o controlo. Cada euro conta.",
        'sarcastic': "Oi! Continua a registar as tuas compras para eu te ajudar melhor 😊",
        'savage':    "Nada de interessante por agora. Surpreende-me.",
    }
    if not feed:
        feed.append({'icone': '💬', 'texto': fallbacks.get(p, fallbacks['calm']), 'tipo': 'info'})

    return feed[:4]


# ── #5 Score automático da última fatura ──────────────────────────────────────
def _score_ultima_fatura(fatura):
    """Devolve um score rápido (0-100) e label para a última fatura."""
    if not fatura or not fatura.total:
        return None

    from app.scoring import CATEGORY_WEIGHTS
    base   = 50
    cat_w  = CATEGORY_WEIGHTS.get(fatura.categoria or 'Outros', 0.90)
    # Penalizar compras caras sem garantia
    has_garantia = bool(fatura.data_garantia)
    valor = fatura.total or 0

    score = base * cat_w
    if has_garantia:  score += 15
    if valor < 50:    score += 10
    elif valor > 300: score -= 15
    elif valor > 100: score -= 5

    score = max(5, min(98, round(score)))

    if score >= 75:   label, cor = 'Vale a pena', '#00D68F'
    elif score >= 50: label, cor = 'Razoável',    '#FFB800'
    else:             label, cor = 'Questiona-te', '#FF4757'

    return {'score': score, 'label': label, 'cor': cor,
            'loja': fatura.loja or fatura.nome_ficheiro,
            'total': fatura.total, 'categoria': fatura.categoria}


@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    faturas    = Fatura.query.filter_by(user_id=current_user.id).order_by(Fatura.data_upload.desc()).all()
    conversas  = Conversa.query.filter_by(user_id=current_user.id).order_by(Conversa.timestamp.desc()).limit(5).all()

    total_gasto   = sum(f.total or 0 for f in faturas)
    num_faturas   = len(faturas)
    num_conversas = Conversa.query.filter_by(user_id=current_user.id).count()

    lojas = defaultdict(float)
    for f in faturas:
        lojas[f.loja or 'Desconhecida'] += f.total or 0
    top_loja = max(lojas, key=lojas.get) if lojas else '—'

    categorias = defaultdict(float)
    for f in faturas:
        categorias[f.categoria or 'Outros'] += f.total or 0
    cat_labels = list(categorias.keys())
    cat_values = [round(categorias[c], 2) for c in cat_labels]

    lojas_sorted = sorted(lojas.items(), key=lambda x: x[1], reverse=True)[:6]
    loja_labels  = [l[0] for l in lojas_sorted]
    loja_values  = [round(l[1], 2) for l in lojas_sorted]

    trend_labels, trend_values = _evolucao_mensal_real(faturas)
    has_trend = any(v > 0 for v in trend_values)

    hoje    = datetime.now()
    alertas = []
    for f in faturas:
        data_dev = _parse_date(f.data_devolucao)
        if data_dev and data_dev >= hoje:
            dias = (data_dev - hoje).days
            if dias <= 7:
                alertas.append({'tipo': 'devolucao', 'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—', 'data': f.data_devolucao,
                    'dias': dias, 'urgencia': 'critico' if dias <= 3 else 'aviso'})
        data_gar = _parse_date(f.data_garantia)
        if data_gar and data_gar >= hoje:
            dias = (data_gar - hoje).days
            if dias <= 30:
                alertas.append({'tipo': 'garantia', 'fatura': f.nome_ficheiro,
                    'loja': f.loja or '—', 'data': f.data_garantia,
                    'dias': dias, 'urgencia': 'critico' if dias <= 7 else 'aviso'})
    alertas.sort(key=lambda x: x['dias'])

    subs_data    = detect_subscriptions(current_user.id)
    personalidade = _normalise_personality(getattr(current_user, 'personalidade', 'calm'))  # #6 fix
    orcamento    = getattr(current_user, 'orcamento_mensal', 0) or 0

    metas_info   = _get_metas_dashboard(current_user.id)
    mood         = _calcular_mood(total_gasto, orcamento, len(alertas), personalidade)
    streak       = _atualizar_streak(current_user, faturas, orcamento)
    feed_verly   = _gerar_feed_verly(faturas, conversas, orcamento, subs_data, personalidade, metas_info)

    # #7 — Comparação mensal
    comparacao = _comparacao_mensal(faturas)

    # #5 — Score automático da última fatura
    ultima_fatura   = faturas[0] if faturas else None
    score_ultima    = _score_ultima_fatura(ultima_fatura)

    # #4 — dados do relatório para card no dashboard
    from app.reports import _regret_factor
    desperdicado_mes = sum(
        (f.total or 0) * _regret_factor(f.categoria or 'Outros')
        for f in faturas
    )

    return render_template('dashboard.html',
        total_gasto=total_gasto,
        num_faturas=num_faturas,
        num_conversas=num_conversas,
        top_loja=top_loja,
        cat_labels=json.dumps(cat_labels),
        cat_values=json.dumps(cat_values),
        loja_labels=json.dumps(loja_labels),
        loja_values=json.dumps(loja_values),
        trend_labels=json.dumps(trend_labels),
        trend_values=json.dumps(trend_values),
        has_trend=has_trend,
        ultimas_faturas=faturas[:5],
        conversas_recentes=conversas,
        alertas=alertas,
        subs_total_mensal=subs_data['total_mensal_desperdicado'],
        subs_count_danger=subs_data['count_danger'],
        subs_count_warning=subs_data['count_warning'],
        subs_top=subs_data['subscriptions'][:3],
        mood=mood,
        streak=streak,
        feed_verly=feed_verly,
        orcamento=orcamento,
        metas_info=metas_info,
        comparacao=comparacao,
        score_ultima=score_ultima,
        desperdicado_mes=desperdicado_mes,
    )