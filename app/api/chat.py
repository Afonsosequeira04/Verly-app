"""
app/api/chat.py — Chat API para mobile (JWT)

POST /api/v1/chat/mensagem   → envia mensagem, recebe resposta da IA
GET  /api/v1/chat/historico  → histórico das últimas N conversas
POST /api/v1/chat/limpar     → apaga histórico
"""

import os
import logging
import requests
import re
import unicodedata
from datetime import date, timedelta
from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import Conversa, Fatura, User, Meta, CATEGORIAS
from app import db

logger = logging.getLogger(__name__)

# ── Normalização de personalidade ──────────────────────────────────────────────

_PERSONALITY_ALIASES = {'strict': 'pro', 'friendly': 'calm', 'rebel': 'savage'}
_VALID_PERSONALITIES = {'savage', 'sarcastic', 'calm', 'pro'}

def _normalise_personality(p):
    p = (p or 'calm').strip().lower()
    p = _PERSONALITY_ALIASES.get(p, p)
    return p if p in _VALID_PERSONALITIES else 'calm'

# ── System prompts ─────────────────────────────────────────────────────────────

SYSTEM_PROMPTS = {
    'savage': """És a Verly. Assistente financeira brutal e sem filtros.
REGRAS:
- Respostas CURTAS. Máximo 3-4 frases. Nunca mais.
- Tom direto e cortante. Sem "Olá", sem "Estou aqui para ajudar".
- Usa os dados reais das faturas. Nunca inventes valores.
- Quando o utilizador gasta mal, diz-lhe com exemplos concretos.
- Português de Portugal.""",

    'sarcastic': """És a Verly. Assistente financeira sarcástica e irónica.
REGRAS:
- Respostas CURTAS. Máximo 3-4 frases. Nunca mais.
- Tom irónico e espirituoso. Sem "Olá", sem introduções longas.
- Usa os dados reais das faturas. Nunca inventes valores.
- Sarcasmo inteligente que faça pensar.
- Português de Portugal.""",

    'calm': """És a Verly. Coach financeira empática e direta.
REGRAS:
- Respostas CURTAS e úteis. Máximo 3-4 frases. Nunca mais.
- Vai direto ao ponto. Sem "Olá", sem parágrafos longos.
- Usa os dados reais das faturas. Nunca inventes valores.
- Sê concreto: números, categorias, datas reais.
- Português de Portugal.""",

    'pro': """És a Verly. CFO pessoal analítico e preciso.
REGRAS:
- Respostas CURTAS e factuais. Máximo 3-4 frases. Nunca mais.
- Vai direto aos números. Sem introduções.
- Usa os dados reais das faturas. Nunca inventes valores.
- Foca em: totais, categorias, padrões de gasto.
- Português de Portugal.""",
}

# ── Helpers de contexto ────────────────────────────────────────────────────────

def _build_faturas_context(faturas) -> str:
    if not faturas:
        return "O utilizador ainda não tem faturas registadas."
    linhas = [f"Total de faturas: {len(faturas)}"]
    por_categoria = {}
    for f in faturas:
        linha = f"- {f.loja or 'Loja desconhecida'}"
        if f.data_compra:
            linha += f" | {f.data_compra}"
        if f.total:
            linha += f" | {f.total:.2f}€"
        if f.categoria:
            linha += f" | {f.categoria}"
        if f.data_garantia:
            linha += f" | garantia até {f.data_garantia}"
        linhas.append(linha)
        cat = f.categoria or 'Outros'
        por_categoria[cat] = por_categoria.get(cat, 0) + (f.total or 0)
    total = sum(f.total or 0 for f in faturas)
    linhas.append(f"\nTotal gasto (todas as faturas): {total:.2f}€")
    if por_categoria:
        linhas.append("\nGastos por categoria:")
        for cat, val in sorted(por_categoria.items(), key=lambda x: x[1], reverse=True):
            linhas.append(f"  {cat}: {val:.2f}€")
    return "\n".join(linhas)


def _build_metas_context(user_id) -> str:
    from app.metas import get_gastos_mes_atual
    metas = Meta.query.filter_by(user_id=user_id).all()
    if not metas:
        return ""
    gastos = get_gastos_mes_atual(user_id)
    linhas = ["\n--- METAS MENSAIS ---"]
    for m in metas:
        gasto = gastos.get(m.categoria, 0)
        pct = round((gasto / m.valor_limite) * 100) if m.valor_limite > 0 else 0
        estado = "✅ OK" if pct < 80 else ("⚠️ QUASE NO LIMITE" if pct < 100 else "🔴 ULTRAPASSADO")
        linhas.append(f"• {m.categoria}: {gasto:.2f}€ de {m.valor_limite:.2f}€ ({pct}%) — {estado}")
    return "\n".join(linhas)


def _get_historico_recente(user_id, limite=10):
    conversas = (
        Conversa.query
        .filter_by(user_id=user_id)
        .order_by(Conversa.timestamp.desc())
        .limit(limite)
        .all()
    )
    historico = []
    for c in reversed(conversas):
        historico.append({"role": "user", "content": c.pergunta})
        historico.append({"role": "assistant", "content": c.resposta})
    return historico


def _normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode('ascii')
    return texto.lower()


def _categoria_da_mensagem(texto: str):
    normalizado = _normalizar_texto(texto)
    for categoria in CATEGORIAS:
        if _normalizar_texto(categoria) in normalizado:
            return categoria

    aliases = {
        'alimentacao': 'Alimentação',
        'comida': 'Alimentação',
        'restaurante': 'Alimentação',
        'supermercado': 'Alimentação',
        'tecnologia': 'Tecnologia',
        'roupa': 'Vestuário',
        'vestuario': 'Vestuário',
        'casa': 'Casa & Decoração',
        'decoracao': 'Casa & Decoração',
        'saude': 'Saúde & Beleza',
        'beleza': 'Saúde & Beleza',
        'desporto': 'Desporto',
        'entretenimento': 'Entretenimento',
        'transportes': 'Transportes',
        'transporte': 'Transportes',
        'educacao': 'Educação',
    }
    for key, categoria in aliases.items():
        if key in normalizado:
            return categoria
    return None


def _valor_da_mensagem(texto: str):
    matches = re.findall(r'(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euros)?', _normalizar_texto(texto))
    if not matches:
        return None
    try:
        valor = float(matches[-1].replace(',', '.'))
        return round(valor, 2) if valor > 0 else None
    except ValueError:
        return None


def _nome_patrimonio_da_mensagem(texto: str):
    normalizado = _normalizar_texto(texto)
    normalizado = re.sub(r'\d+(?:[.,]\d{1,2})?\s*(?:eur|euros)?', ' ', normalizado)
    normalizado = re.sub(
        r'\b(adiciona|adicionar|cria|criar|regista|registrar|mete|coloca|no|na|ao|a|meu|minha|net|worth|patrimonio|ativo|ativos|divida|dividas|valor|de)\b',
        ' ',
        normalizado,
    )
    normalizado = re.sub(r'\s+', ' ', normalizado).strip()
    return normalizado[:60].title() if normalizado else 'Item patrimonio'


def _auto_meta_payload(user_id: int):
    try:
        from app.financial_records import summarize_expenses
        summary = summarize_expenses(user_id, currency='EUR')
    except Exception:
        return None

    rows = (summary.get('mes_atual') or {}).get('por_categoria') or summary.get('por_categoria') or []
    metas_existentes = {
        _normalizar_texto(meta.categoria)
        for meta in Meta.query.filter_by(user_id=user_id).all()
    }
    for row in rows:
        categoria = row.get('categoria') or row.get('nome')
        if categoria not in CATEGORIAS or _normalizar_texto(categoria) in metas_existentes:
            continue
        try:
            gasto = float(row.get('valor') or row.get('total') or 0)
        except (TypeError, ValueError):
            gasto = 0
        if gasto <= 0:
            continue
        limite = max(20, round((gasto * 0.9) / 10) * 10)
        return {
            'nome': categoria,
            'categoria': categoria,
            'limite': round(limite, 2),
        }
    return None


def _email_da_mensagem(texto: str):
    match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', texto or '')
    return match.group(0).lower() if match else None


def _produto_wishlist_da_mensagem(texto: str):
    normalizado = _normalizar_texto(texto)
    cleaned = normalizado
    cleaned = re.sub(r'\b(?:abaixo|ate|alvo|por|de)\s+\d+(?:[.,]\d{1,2})?\s*(?:eur|euros)?\b', ' ', cleaned)
    cleaned = re.sub(r'\b\d+(?:[.,]\d{1,2})?\s*(?:eur|euros)\b', ' ', cleaned)
    cleaned = re.sub(r'\b(adiciona|adicionar|seguir|segue|monitoriza|wishlist|live deals?|produto|compra|preco|preco alvo|abaixo|baixar|quando|ficar|por|de|a|o|um|uma|na|no|ao|ate|eur|euros)\b', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if len(cleaned) < 3:
        return None
    return cleaned[:80].title()


def _next_bill_date(days=7):
    return (date.today() + timedelta(days=days)).isoformat()


def _subscription_bills_payload(user_id: int):
    try:
        from app.subscriptions import detect_subscriptions
        data = detect_subscriptions(user_id)
    except Exception:
        return []
    bills = []
    for sub in (data.get('subscriptions') or [])[:5]:
        price = float(sub.get('preco_mensal') or 0)
        if price <= 0:
            continue
        bills.append({
            'titulo': sub.get('nome') or 'Subscricao',
            'categoria': 'Subscricoes',
            'valor': round(price, 2),
            'currency': sub.get('currency') or 'EUR',
            'data_vencimento': _next_bill_date(7),
            'recorrencia': 'monthly',
            'notas': 'Criado pelo copiloto a partir de subscricoes detetadas.',
            'lembrar_dias_antes': 3,
        })
    return bills


def _refund_draft_payload(user_id: int):
    try:
        from app.refund_radar import detect_refund_opportunities
        data = detect_refund_opportunities(user_id)
    except Exception:
        return None
    opportunity = next((item for item in data.get('opportunities') or [] if item.get('action')), None)
    if not opportunity:
        return None
    action = opportunity.get('action') or {}
    return {
        'key': opportunity.get('key'),
        'title': opportunity.get('title'),
        'message': action.get('email_body') or action.get('support_message') or opportunity.get('message'),
        'subject': action.get('email_subject') or opportunity.get('title'),
        'route': 'RefundRadar',
        'params': {'refundKey': opportunity.get('key')},
    }


def _family_expense_action_payload(user_id: int, texto: str):
    try:
        from app.api.planning import _family_for_user, _family_to_dict
        family = _family_for_user(user_id)
        if not family:
            return None
        data = _family_to_dict(family, current_user_id=user_id)
    except Exception:
        return None
    expenses = data.get('recent_expenses') or []
    if not expenses:
        return None
    normalizado = _normalizar_texto(texto)
    selected = None
    for expense in expenses:
        merchant = _normalizar_texto(expense.get('merchant') or '')
        if merchant and merchant in normalizado:
            selected = expense
            break
    selected = selected or expenses[0]
    include_family = not any(k in normalizado for k in ['pessoal', 'privada', 'privado', 'nao familiar', 'não familiar'])
    return {
        'source_type': selected.get('source_type'),
        'source_id': selected.get('source_id'),
        'include_family': include_family,
        'description': selected.get('merchant'),
        'amount': selected.get('amount'),
        'currency': selected.get('currency'),
    }


def _chat_actions(mensagem: str, user_id: int):
    texto = _normalizar_texto(mensagem)
    faturas_count = Fatura.query.filter_by(user_id=user_id).count()
    metas_count = Meta.query.filter_by(user_id=user_id).count()
    actions = []

    def add(action):
        if action['id'] not in {item['id'] for item in actions}:
            actions.append(action)

    if any(k in texto for k in ['upload', 'carregar fatura', 'adicionar fatura', 'nova fatura', 'recibo']):
        add({
            'id': 'open_upload',
            'type': 'navigate',
            'label': 'Carregar fatura',
            'description': 'Abrir upload com IA',
            'route': 'Dashboard',
            'params': {'openUpload': True},
        })

    if any(k in texto for k in ['fatura', 'faturas', 'recibo', 'recibos', 'compras']):
        add({
            'id': 'view_faturas',
            'type': 'navigate',
            'label': 'Ver faturas',
            'route': 'Faturas',
        })

    if any(k in texto for k in ['garantia', 'garantias', 'devolucao', 'devolucoes', 'devolver']):
        add({
            'id': 'view_garantias',
            'type': 'navigate',
            'label': 'Ver garantias',
            'route': 'Garantias',
        })

    if any(k in texto for k in ['reembolso', 'refund', 'reclamar', 'reclamacao', 'cobranca duplicada', 'duplicado', 'devolver dinheiro']):
        wants_draft = any(k in texto for k in ['email', 'mensagem', 'rascunho', 'gerar', 'reclamacao', 'reclamar'])
        draft = _refund_draft_payload(user_id) if wants_draft else None
        if draft:
            add({
                'id': 'draft_refund_email',
                'type': 'draft_refund_email',
                'label': 'Gerar reclamacao',
                'description': draft.get('subject') or 'Rascunho do Refund Radar',
                'payload': draft,
                'requires_confirmation': False,
            })
        add({
            'id': 'open_refund_radar',
            'type': 'navigate',
            'label': 'Abrir Refund Radar',
            'route': 'RefundRadar',
        })

    if any(k in texto for k in ['live deal', 'live deals', 'wishlist', 'seguir produto', 'baixar preco', 'cupao', 'cupoes', 'stock perto', 'melhor preco']):
        wants_watch = any(k in texto for k in ['adiciona', 'adicionar', 'seguir', 'segue', 'monitoriza', 'avisa', 'wishlist'])
        product_name = _produto_wishlist_da_mensagem(mensagem)
        target_price = _valor_da_mensagem(mensagem)
        if wants_watch and product_name:
            add({
                'id': 'add_live_deal_watch',
                'type': 'add_live_deal_watch',
                'label': 'Adicionar a wishlist',
                'description': f'Seguir {product_name}' + (f' abaixo de {target_price:.2f} EUR' if target_price else ''),
                'payload': {
                    'product_name': product_name,
                    'category': _categoria_da_mensagem(mensagem) or 'Outros',
                    'target_price': target_price,
                    'currency': 'EUR',
                    'refresh': True,
                    'notify_stock': True,
                    'notify_coupon': True,
                },
                'requires_confirmation': True,
            })
        add({
            'id': 'open_live_deals',
            'type': 'navigate',
            'label': 'Abrir Live Deals',
            'route': 'LiveDeals',
        })

    if any(k in texto for k in ['score', 'analisar compra', 'boa compra', 'vale a pena', 'comprar']):
        add({
            'id': 'open_score',
            'type': 'navigate',
            'label': 'Analisar compra',
            'route': 'Score',
        })

    if any(k in texto for k in ['dividir', 'despesa partilhada', 'tricount', 'grupo', 'amigos devem', 'acerto']):
        add({
            'id': 'open_groups',
            'type': 'navigate',
            'label': 'Dividir despesas',
            'route': 'Grupos',
        })

    if any(k in texto for k in ['gmail', 'importar', 'importacao', 'fonte', 'fontes']):
        if any(k in texto for k in ['sincroniza', 'sincronizar', 'sync', 'atualiza', 'atualizar']):
            add({
                'id': 'sync_gmail',
                'type': 'sync_gmail',
                'label': 'Sincronizar Gmail',
                'description': 'Importar novas faturas do Gmail ligado',
                'requires_confirmation': True,
            })
        add({
            'id': 'open_import',
            'type': 'navigate',
            'label': 'Importar dados',
            'route': 'ImportarDados',
        })

    if any(k in texto for k in ['banco', 'open banking', 'transacoes', 'transacoes bancarias']):
        if any(k in texto for k in ['sincroniza', 'sincronizar', 'sync', 'atualiza', 'atualizar']):
            add({
                'id': 'sync_bank',
                'type': 'sync_bank',
                'label': 'Sincronizar banco',
                'description': 'Buscar movimentos das contas bancarias ligadas',
                'requires_confirmation': True,
            })
        add({
            'id': 'open_banking',
            'type': 'navigate',
            'label': 'Ligar banco',
            'route': 'ImportarDados',
        })

    if any(k in texto for k in ['subscricao', 'subscricoes', 'assinatura', 'recorrente', 'netflix', 'spotify']):
        if any(k in texto for k in ['bill', 'bills', 'conta', 'calendario', 'pagamento', 'obrigacao', 'cria', 'criar']):
            bills = _subscription_bills_payload(user_id)
            if bills:
                add({
                    'id': 'create_bills_from_subscriptions',
                    'type': 'create_bills_from_subscriptions',
                    'label': 'Criar bills',
                    'description': f'Criar {len(bills)} pagamento(s) recorrente(s)',
                    'payload': {'bills': bills},
                    'requires_confirmation': True,
                })
        add({
            'id': 'open_subscriptions',
            'type': 'navigate',
            'label': 'Auditar subscricoes',
            'route': 'MinhasSubscricoes',
        })

    if any(k in texto for k in ['familia', 'familiar', 'plano familiar']):
        email = _email_da_mensagem(mensagem)
        role = 'partner'
        if any(k in texto for k in ['admin', 'administrador']):
            role = 'admin'
        elif any(k in texto for k in ['crianca', 'filho', 'filha']):
            role = 'child'
        elif any(k in texto for k in ['so leitura', 'leitura', 'viewer', 'ver apenas']):
            role = 'viewer'
        elif any(k in texto for k in ['parceiro', 'parceira', 'partner']):
            role = 'partner'

        family_exists = True
        try:
            from app.api.planning import _family_for_user
            family_exists = bool(_family_for_user(user_id))
        except Exception:
            family_exists = True

        if email and any(k in texto for k in ['convida', 'convidar', 'convite', 'adiciona', 'adicionar']):
            if family_exists:
                add({
                    'id': 'invite_family_member',
                    'type': 'invite_family_member',
                    'label': 'Convidar membro',
                    'description': f'Enviar convite familiar para {email}',
                    'payload': {'email': email, 'role': role},
                    'requires_confirmation': True,
                })
            else:
                add({
                    'id': 'create_family_plan_and_invite',
                    'type': 'create_family_plan_and_invite',
                    'label': 'Criar plano e convidar',
                    'description': f'Ativar plano familiar e convidar {email}',
                    'payload': {
                        'family': {'nome': 'Plano familiar', 'orcamento_mensal': 2000, 'currency': 'EUR'},
                        'email': email,
                        'role': role,
                    },
                    'requires_confirmation': True,
                })

        categoria_budget = _categoria_da_mensagem(mensagem)
        if any(k in texto for k in ['budget', 'orcamento', 'limite']) and (categoria_budget or 'categoria' in texto):
            categoria = categoria_budget or 'Casa & Decoracao'
            valor = _valor_da_mensagem(mensagem)
            if valor:
                if family_exists:
                    add({
                        'id': f'create_family_budget_{_normalizar_texto(categoria).replace(" ", "_")}',
                        'type': 'create_family_category_budget',
                        'label': 'Criar budget familiar',
                        'description': f'{categoria}: {valor:.2f} EUR por mes',
                        'payload': {'category': categoria, 'amount': valor, 'currency': 'EUR'},
                        'requires_confirmation': True,
                    })
                else:
                    add({
                        'id': f'create_family_plan_budget_{_normalizar_texto(categoria).replace(" ", "_")}',
                        'type': 'create_family_plan_and_budget',
                        'label': 'Criar plano e budget',
                        'description': f'Plano familiar com budget de {categoria}',
                        'payload': {
                            'family': {'nome': 'Plano familiar', 'orcamento_mensal': max(valor, 2000), 'currency': 'EUR'},
                            'budget': {'category': categoria, 'amount': valor, 'currency': 'EUR'},
                        },
                        'requires_confirmation': True,
                    })

        if any(k in texto for k in ['despesa', 'movimento', 'fatura']) and any(k in texto for k in ['familiar', 'pessoal', 'familia']):
            payload = _family_expense_action_payload(user_id, mensagem)
            if payload:
                add({
                    'id': 'mark_family_expense',
                    'type': 'mark_family_expense',
                    'label': 'Marcar despesa',
                    'description': f"{payload.get('description') or 'Despesa'} como {'familiar' if payload.get('include_family') else 'pessoal'}",
                    'payload': payload,
                    'requires_confirmation': True,
                })

        family_plan_action_exists = any(item['type'] in {'create_family_plan_and_invite', 'create_family_plan_and_budget'} for item in actions)
        if (
            not family_plan_action_exists
            and any(k in texto for k in ['cria', 'criar'])
            and any(k in texto for k in ['plano familiar', 'familia'])
        ):
            valor = _valor_da_mensagem(mensagem)
            add({
                'id': 'create_family_plan',
                'type': 'create_family_plan',
                'label': 'Criar plano familiar',
                'description': 'Ativar despesas e orcamentos partilhados',
                'payload': {
                    'nome': 'Plano familiar',
                    'orcamento_mensal': valor or 2000,
                    'currency': 'EUR',
                },
                'requires_confirmation': True,
            })

        add({
            'id': 'open_family_plan',
            'type': 'navigate',
            'label': 'Abrir plano familiar',
            'route': 'FamilyPlan',
        })

    if any(k in texto for k in ['net worth', 'patrimonio', 'patrimonio liquido', 'ativo', 'ativos', 'divida', 'dividas']):
        valor = _valor_da_mensagem(mensagem)
        wants_create = any(k in texto for k in ['adiciona', 'adicionar', 'cria', 'criar', 'regista', 'registrar', 'mete', 'coloca'])
        tipo = 'liability' if any(k in texto for k in ['divida', 'dividas', 'credito', 'emprestimo', 'cartao']) else 'asset'
        if wants_create and valor:
            add({
                'id': 'create_networth_item',
                'type': 'create_networth_item',
                'label': 'Adicionar ao net worth',
                'description': f'{valor:.2f} EUR como {"divida" if tipo == "liability" else "ativo"}',
                'payload': {
                    'nome': _nome_patrimonio_da_mensagem(mensagem),
                    'tipo': tipo,
                    'categoria': 'Outros',
                    'valor': valor,
                    'currency': 'EUR',
                },
                'requires_confirmation': True,
            })
        add({
            'id': 'open_networth',
            'type': 'navigate',
            'label': 'Ver net worth',
            'route': 'NetWorth',
        })

    if any(k in texto for k in ['grafico', 'estatistica', 'estatisticas', 'tendencia', 'categorias']):
        add({
            'id': 'open_stats',
            'type': 'navigate',
            'label': 'Ver estatísticas',
            'route': 'Estatisticas',
        })

    if any(k in texto for k in ['meta', 'limite', 'orcamento', 'orçamento']):
        categoria = _categoria_da_mensagem(mensagem)
        valor = _valor_da_mensagem(mensagem)
        wants_create = any(k in texto for k in ['cria', 'criar', 'define', 'definir', 'mete', 'coloca', 'faz'])
        if wants_create and (not categoria or not valor):
            auto_payload = _auto_meta_payload(user_id)
            if auto_payload:
                categoria = categoria or auto_payload['categoria']
                valor = valor or auto_payload['limite']
        if wants_create and categoria and valor:
            add({
                'id': f'create_meta_{_normalizar_texto(categoria).replace(" ", "_")}',
                'type': 'create_meta',
                'label': f'Criar meta de {categoria}',
                'description': f'Limite mensal de {valor:.2f} EUR',
                'payload': {
                    'nome': categoria,
                    'categoria': categoria,
                    'limite': valor,
                },
                'requires_confirmation': True,
            })
        add({
            'id': 'open_goals',
            'type': 'navigate',
            'label': 'Ver metas',
            'route': 'Metas',
        })

    if any(k in texto for k in ['limpar chat', 'apagar conversa', 'limpar conversa']):
        add({
            'id': 'clear_chat',
            'type': 'clear_chat',
            'label': 'Limpar conversa',
            'description': 'Apaga o histórico deste chat',
            'requires_confirmation': True,
        })

    if faturas_count == 0:
        add({
            'id': 'open_upload_first',
            'type': 'navigate',
            'label': 'Adicionar primeira fatura',
            'route': 'Dashboard',
            'params': {'openUpload': True},
        })
    elif metas_count == 0 and any(k in texto for k in ['poupar', 'organizar', 'começar', 'comecar']):
        add({
            'id': 'open_goals_first',
            'type': 'navigate',
            'label': 'Criar primeira meta',
            'route': 'Metas',
        })

    return actions[:5]


# ── Groq chat direto (sem índice — funciona mesmo sem ficheiros carregados) ────

def _chat_groq_direto(mensagem: str, user_id: int, personalidade: str) -> str:
    """Chama Groq diretamente com contexto das faturas — sem dependência do índice LlamaIndex."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return "⚠️ Chave GROQ_API_KEY não configurada no servidor."

    faturas = Fatura.query.filter_by(user_id=user_id).all()
    system_prompt = SYSTEM_PROMPTS.get(personalidade, SYSTEM_PROMPTS['calm'])
    faturas_ctx   = _build_faturas_context(faturas)
    metas_ctx     = _build_metas_context(user_id)
    historico     = _get_historico_recente(user_id, limite=10)
    try:
        from app.semantic_finance import semantic_context
        memoria_semantica = semantic_context(user_id, mensagem, top_k=6)
    except Exception:
        memoria_semantica = ''

    system_content = (
        f"{system_prompt}\n\n"
        f"DADOS REAIS DO UTILIZADOR:\n{faturas_ctx}"
        f"{metas_ctx}"
        f"{memoria_semantica}\n\n"
        "MEMÓRIA: Tens acesso ao histórico desta conversa. Usa-o para respostas coerentes. "
        "Não te apresentes novamente se já o fizeste. "
        "Se o utilizador pedir uma ação na app, responde curto e confirma o que faria; "
        "os botões de ação são tratados pela interface."
    )

    messages = [{"role": "system", "content": system_content}] + historico + [
        {"role": "user", "content": mensagem}
    ]

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=20,
        )
        if r.status_code != 200:
            logger.error(f"Groq error {r.status_code}: {r.text}")
            return "Erro ao contactar o assistente. Tenta novamente."
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"Groq exception: {e}")
        return "Erro de ligação ao assistente. Verifica a tua conexão."


# ── Endpoints ──────────────────────────────────────────────────────────────────

@api_bp.route('/chat/mensagem', methods=['POST'])
@jwt_required()
def chat_mensagem():
    user_id  = int(get_jwt_identity())
    user     = User.query.get_or_404(user_id)
    data     = request.get_json(silent=True) or {}
    mensagem = (data.get('mensagem') or '').strip()[:2000]

    if not mensagem:
        return jsonify({'error': 'Mensagem vazia.'}), 400

    personalidade = _normalise_personality(getattr(user, 'personalidade', 'calm'))

    try:
        resposta = _chat_groq_direto(mensagem, user_id, personalidade)
        actions = _chat_actions(mensagem, user_id)
    except Exception as e:
        logger.error(f'Erro no chat API: {e}')
        return jsonify({'error': 'Erro ao processar a mensagem.'}), 500

    conversa = Conversa(user_id=user_id, pergunta=mensagem, resposta=resposta)
    db.session.add(conversa)
    db.session.commit()

    return jsonify({'resposta': resposta, 'id': conversa.id, 'actions': actions})


@api_bp.route('/chat/historico', methods=['GET'])
@jwt_required()
def chat_historico():
    user_id   = int(get_jwt_identity())
    limite    = min(int(request.args.get('limite', 20)), 50)
    conversas = (
        Conversa.query
        .filter_by(user_id=user_id)
        .order_by(Conversa.timestamp.desc())
        .limit(limite)
        .all()
    )
    return jsonify({'historico': [
        {
            'id':        c.id,
            'pergunta':  c.pergunta,
            'resposta':  c.resposta,
            'actions':   _chat_actions(c.pergunta, user_id),
            'timestamp': c.timestamp.isoformat() if c.timestamp else None,
        }
        for c in reversed(conversas)
    ]})


@api_bp.route('/chat/limpar', methods=['POST'])
@jwt_required()
def chat_limpar():
    user_id = int(get_jwt_identity())
    Conversa.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'success': True})
