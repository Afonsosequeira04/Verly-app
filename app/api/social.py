# app/api/social.py — Rotas API para Grupos, Desafios, Recompensas, Chat, Feed, IA, Streaks

from datetime import datetime, timedelta, date
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api  import api_bp
from app      import db
from app.financial_intelligence import build_financial_intelligence
from app.financial_records import normalize_text, summarize_expenses
from app.models import User
from app.models_social import (
    Grupo, grupo_membro, Desafio, DesafioParticipante, Recompensa,
    MensagemGrupo, ReacaoMensagem, AtividadeGrupo, StreakMembroGrupo, BADGES
)


def _current_user():
    return User.query.get(int(get_jwt_identity()))


# ── Grupos ─────────────────────────────────────────────────────────────────────

@api_bp.route('/grupos', methods=['GET'])
@jwt_required()
def listar_grupos():
    user = _current_user()
    grupos = (
        Grupo.query
        .join(grupo_membro, Grupo.id == grupo_membro.c.grupo_id)
        .filter(grupo_membro.c.user_id == user.id, Grupo.ativo == True)
        .all()
    )
    return jsonify([g.to_dict(user.id) for g in grupos])


@api_bp.route('/grupos', methods=['POST'])
@jwt_required()
def criar_grupo():
    user = _current_user()
    data = request.get_json() or {}

    nome = (data.get('nome') or '').strip()
    if not nome:
        return jsonify({'error': 'Nome obrigatório'}), 400

    grupo = Grupo(
        nome=nome,
        descricao=data.get('descricao', ''),
        emoji=data.get('emoji', '👥'),
        criador_id=user.id,
    )
    db.session.add(grupo)
    db.session.flush()

    db.session.execute(
        grupo_membro.insert().values(grupo_id=grupo.id, user_id=user.id, role='admin')
    )

    for amigo_id in data.get('amigos_ids', []):
        amigo = User.query.get(amigo_id)
        if amigo:
            db.session.execute(
                grupo_membro.insert().values(grupo_id=grupo.id, user_id=amigo_id, role='membro')
            )

    # Feed: membro entrou
    _registar_atividade(grupo.id, user.id, 'membro_entrou',
        f'{user.nome} criou o grupo', emoji='🎉')

    db.session.commit()

    _dar_recompensa_se_nao_existe(user.id, 'primeiro_grupo',
        titulo='Fundador!', descricao='Criaste o teu primeiro grupo', icone='🏅', xp=50)

    return jsonify(grupo.to_dict(user.id)), 201


@api_bp.route('/grupos/<int:grupo_id>', methods=['GET'])
@jwt_required()
def detalhe_grupo(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)
    return jsonify(grupo.to_dict(user.id))


@api_bp.route('/grupos/<int:grupo_id>/convidar', methods=['POST'])
@jwt_required()
def convidar_para_grupo(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    data     = request.get_json() or {}
    amigo_id = data.get('user_id')
    amigo    = User.query.get(amigo_id) if amigo_id else None
    if not amigo:
        return jsonify({'error': 'Utilizador não encontrado'}), 404

    exists = db.session.execute(
        grupo_membro.select().where(
            grupo_membro.c.grupo_id == grupo_id,
            grupo_membro.c.user_id  == amigo_id,
        )
    ).fetchone()
    if exists:
        return jsonify({'error': 'Já é membro'}), 400

    db.session.execute(
        grupo_membro.insert().values(grupo_id=grupo_id, user_id=amigo_id, role='membro')
    )
    _registar_atividade(grupo_id, amigo_id, 'membro_entrou',
        f'{amigo.nome} entrou no grupo', emoji='👋')
    db.session.commit()
    return jsonify({'ok': True})


@api_bp.route('/grupos/<int:grupo_id>/sair', methods=['POST'])
@jwt_required()
def sair_grupo(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    db.session.execute(
        grupo_membro.delete().where(
            grupo_membro.c.grupo_id == grupo_id,
            grupo_membro.c.user_id  == user.id,
        )
    )
    db.session.commit()
    return jsonify({'ok': True})


# ── Chat do Grupo ──────────────────────────────────────────────────────────────

@api_bp.route('/grupos/<int:grupo_id>/chat', methods=['GET'])
@jwt_required()
def listar_chat(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    limite = int(request.args.get('limite', 50))
    mensagens = (
        MensagemGrupo.query
        .filter_by(grupo_id=grupo_id)
        .order_by(MensagemGrupo.enviada_em.desc())
        .limit(limite)
        .all()
    )
    mensagens.reverse()
    return jsonify([m.to_dict(user.id) for m in mensagens])


@api_bp.route('/grupos/<int:grupo_id>/chat', methods=['POST'])
@jwt_required()
def enviar_mensagem(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    data  = request.get_json() or {}
    texto = (data.get('texto') or '').strip()
    if not texto:
        return jsonify({'error': 'Mensagem vazia'}), 400

    msg = MensagemGrupo(grupo_id=grupo_id, user_id=user.id, texto=texto)
    db.session.add(msg)
    db.session.commit()

    return jsonify(msg.to_dict(user.id)), 201


@api_bp.route('/grupos/<int:grupo_id>/chat/<int:msg_id>/reagir', methods=['POST'])
@jwt_required()
def reagir_mensagem(grupo_id, msg_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    data  = request.get_json() or {}
    emoji = (data.get('emoji') or '').strip()
    if not emoji:
        return jsonify({'error': 'Emoji obrigatório'}), 400

    # Toggle: se já existe, remove; se não, adiciona
    reacao = ReacaoMensagem.query.filter_by(
        mensagem_id=msg_id, user_id=user.id, emoji=emoji
    ).first()
    if reacao:
        db.session.delete(reacao)
    else:
        db.session.add(ReacaoMensagem(mensagem_id=msg_id, user_id=user.id, emoji=emoji))

    db.session.commit()

    msg = MensagemGrupo.query.get(msg_id)
    return jsonify(msg.to_dict(user.id) if msg else {})


# ── Feed de Atividade ──────────────────────────────────────────────────────────

@api_bp.route('/grupos/<int:grupo_id>/feed', methods=['GET'])
@jwt_required()
def feed_grupo(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    limite = int(request.args.get('limite', 30))
    atividades = (
        AtividadeGrupo.query
        .filter_by(grupo_id=grupo_id)
        .order_by(AtividadeGrupo.criada_em.desc())
        .limit(limite)
        .all()
    )
    return jsonify([a.to_dict() for a in atividades])


# ── Streak de Grupo ────────────────────────────────────────────────────────────

@api_bp.route('/grupos/<int:grupo_id>/streak/check-in', methods=['POST'])
@jwt_required()
def streak_check_in(grupo_id):
    """Marcar que cumpriu o objetivo hoje neste grupo."""
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    hoje = date.today()
    registo = StreakMembroGrupo.query.filter_by(
        grupo_id=grupo_id, user_id=user.id, data=hoje
    ).first()

    if not registo:
        registo = StreakMembroGrupo(grupo_id=grupo_id, user_id=user.id, data=hoje, cumpriu=True)
        db.session.add(registo)
    else:
        registo.cumpriu = True

    # Verificar se todos os membros já fizeram check-in hoje
    membros = grupo.membros.all()
    check_ins_hoje = StreakMembroGrupo.query.filter_by(
        grupo_id=grupo_id, data=hoje, cumpriu=True
    ).count()

    streak_aumentou = False
    if check_ins_hoje + (0 if registo.id else 1) >= len(membros):
        # Todos cumpriram! Aumentar streak
        ontem = hoje - timedelta(days=1)
        ultimo_streak = grupo.streak_ultima_data
        if ultimo_streak and ultimo_streak.date() == ontem:
            grupo.streak_dias = (grupo.streak_dias or 0) + 1
        elif not ultimo_streak or ultimo_streak.date() < ontem:
            grupo.streak_dias = 1
        grupo.streak_ultima_data = datetime.utcnow()
        streak_aumentou = True

        _registar_atividade(grupo_id, user.id, 'streak_grupo',
            f'Streak do grupo: {grupo.streak_dias} dias! 🔥', emoji='🔥')

        # Badge streak grupo
        if grupo.streak_dias >= 7:
            for m in membros:
                _dar_recompensa_se_nao_existe(m.id, 'streak_grupo_7',
                    titulo='Equipa Unida!', descricao='Streak de grupo de 7 dias',
                    icone='🤝', xp=75)

    db.session.commit()
    return jsonify({
        'ok': True,
        'streak_dias': grupo.streak_dias or 0,
        'streak_aumentou': streak_aumentou,
        'check_ins_hoje': check_ins_hoje,
        'total_membros': len(membros),
    })


@api_bp.route('/grupos/<int:grupo_id>/streak', methods=['GET'])
@jwt_required()
def detalhe_streak_grupo(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    hoje = date.today()
    membros = grupo.membros.all()
    check_ins = StreakMembroGrupo.query.filter_by(grupo_id=grupo_id, data=hoje, cumpriu=True).all()
    ids_check_in = {c.user_id for c in check_ins}

    membros_status = [{
        'id': m.id,
        'nome': m.nome,
        'avatar': m.avatar,
        'cumpriu_hoje': m.id in ids_check_in,
    } for m in membros]

    eu_cumpri = user.id in ids_check_in

    return jsonify({
        'streak_dias': grupo.streak_dias or 0,
        'eu_cumpri_hoje': eu_cumpri,
        'membros': membros_status,
        'check_ins_hoje': len(ids_check_in),
        'total_membros': len(membros),
    })


# ── Desafios ───────────────────────────────────────────────────────────────────

@api_bp.route('/grupos/<int:grupo_id>/desafios', methods=['GET'])
@jwt_required()
def listar_desafios(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    desafios = grupo.desafios.order_by(Desafio.criado_em.desc()).all()
    return jsonify([_desafio_payload(d, user) for d in desafios])


@api_bp.route('/grupos/<int:grupo_id>/desafios', methods=['POST'])
@jwt_required()
def criar_desafio(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    data = request.get_json() or {}

    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'error': 'Título obrigatório'}), 400

    try:
        inicio = datetime.fromisoformat(data['inicio']) if data.get('inicio') else datetime.utcnow()
        fim    = datetime.fromisoformat(data['fim'])    if data.get('fim')    else inicio + timedelta(days=30)
    except Exception:
        return jsonify({'error': 'Datas inválidas'}), 400

    desafio = Desafio(
        grupo_id   = grupo_id,
        criador_id = user.id,
        titulo     = titulo,
        descricao  = data.get('descricao', ''),
        tipo       = data.get('tipo', 'gastar_menos'),
        categoria  = data.get('categoria'),
        valor_alvo = data.get('valor_alvo'),
        inicio     = inicio,
        fim        = fim,
        recompensa = data.get('recompensa', '🏆 Vencedor do desafio'),
        gerado_ia  = data.get('gerado_ia', False),
    )
    db.session.add(desafio)
    db.session.flush()

    _entrar_desafio(desafio.id, user.id)
    for membro in grupo.membros.all():
        if membro.id != user.id:
            _entrar_desafio(desafio.id, membro.id)

    _registar_atividade(grupo_id, user.id, 'desafio_criado',
        f'{user.nome} criou o desafio "{titulo}"', emoji='⚡')

    db.session.commit()
    return jsonify(_desafio_payload(desafio, user)), 201


@api_bp.route('/grupos/<int:grupo_id>/desafios/ia', methods=['POST'])
@jwt_required()
def criar_desafio_ia(grupo_id):
    """Gera um desafio personalizado com IA baseado nos padrões de gasto do grupo."""
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    import json, os

    # Recolher dados de gasto dos membros nos últimos 30 dias
    membros = grupo.membros.all()
    inicio_analise = datetime.utcnow().date() - timedelta(days=30)

    resumo_membros = []
    sugestoes_inteligentes = []
    for membro in membros:
        summary = summarize_expenses(membro.id)
        intelligence = build_financial_intelligence(membro, summary)
        registos = [
            item for item in summary['records']
            if item['date'] and item['date'] >= inicio_analise
        ]

        categorias = {}
        for item in registos:
            cat = item['categoria'] or 'Outros'
            categorias[cat] = categorias.get(cat, 0) + item['value']

        resumo_membros.append({
            'nome': membro.nome,
            'currency': summary['currency'],
            'total_gasto': round(sum(item['value'] for item in registos), 2),
            'top_categorias': [
                [cat, round(valor, 2)]
                for cat, valor in sorted(categorias.items(), key=lambda x: x[1], reverse=True)[:3]
            ],
            'movimentos_excluidos': summary['excluded']['count'],
            'acao_principal': intelligence.get('primary_action'),
            'desafios_sugeridos': intelligence.get('social_challenges', [])[:2],
        })
        sugestoes_inteligentes.extend(intelligence.get('social_challenges', [])[:2])

    # Chamar IA (Groq)
    try:
        import httpx
        groq_key = os.environ.get('GROQ_API_KEY', '')

        prompt = f"""És um assistente financeiro. Analisa os gastos deste grupo e sugere um desafio criativo e realista.

Grupo: {grupo.nome}
Membros e gastos dos últimos 30 dias:
{json.dumps(resumo_membros, ensure_ascii=False, indent=2)}

Responde APENAS com JSON válido neste formato exato:
{{
  "titulo": "...",
  "descricao": "...",
  "tipo": "gastar_menos" ou "categoria_limite" ou "poupar_valor",
  "categoria": "..." ou null,
  "valor_alvo": numero,
  "dias": numero entre 7 e 30,
  "recompensa": "...",
  "justificacao": "..."
}}"""

        resp = httpx.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
            json={
                'model': 'llama3-8b-8192',
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': 500,
                'temperature': 0.7,
            },
            timeout=20,
        )
        resp.raise_for_status()
        texto = resp.json()['choices'][0]['message']['content']

        # Parse JSON da resposta
        import re
        match = re.search(r'\{.*\}', texto, re.DOTALL)
        if not match:
            raise ValueError('JSON não encontrado')
        sugestao = json.loads(match.group())

        return jsonify({
            'sugestao': sugestao,
            'resumo_grupo': resumo_membros,
            'sugestoes_inteligentes': sugestoes_inteligentes[:5],
        })

    except Exception as e:
        # Fallback: sugestão genérica
        cat_comum = None
        if resumo_membros:
            todas_cats = {}
            for m in resumo_membros:
                for cat, val in m['top_categorias']:
                    todas_cats[cat] = todas_cats.get(cat, 0) + val
            if todas_cats:
                cat_comum = max(todas_cats, key=todas_cats.get)

        if sugestoes_inteligentes:
            smart = sugestoes_inteligentes[0]
            return jsonify({
                'sugestao': {
                    'titulo': smart.get('title') or 'Desafio inteligente do grupo',
                    'descricao': smart.get('description') or 'Desafio criado a partir dos gastos reais do grupo.',
                    'tipo': smart.get('type') or 'gastar_menos',
                    'categoria': smart.get('category'),
                    'valor_alvo': smart.get('target') or 0,
                    'dias': smart.get('days') or 14,
                    'recompensa': 'Campeao da poupanca',
                    'justificacao': 'Sugestao criada a partir dos gastos reais e dos padroes do grupo.',
                },
                'resumo_grupo': resumo_membros,
                'sugestoes_inteligentes': sugestoes_inteligentes[:5],
            })

        return jsonify({
            'sugestao': {
                'titulo': f'Desafio de {cat_comum or "Poupança"} do Grupo',
                'descricao': f'Quem consegue gastar menos em {cat_comum or "geral"} este mês?',
                'tipo': 'categoria_limite' if cat_comum else 'gastar_menos',
                'categoria': cat_comum,
                'valor_alvo': 150,
                'dias': 14,
                'recompensa': '🏆 Campeão da Poupança',
                'justificacao': f'{cat_comum or "Gastos gerais"} é a categoria mais frequente no grupo.',
            },
            'resumo_grupo': resumo_membros,
        })


@api_bp.route('/desafios/<int:desafio_id>', methods=['GET'])
@jwt_required()
def detalhe_desafio(desafio_id):
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)
    grupo   = Grupo.query.get(desafio.grupo_id)
    _assert_membro(grupo, user.id)
    return jsonify(_desafio_payload(desafio, user))


@api_bp.route('/desafios/<int:desafio_id>/progresso', methods=['POST'])
@jwt_required()
def atualizar_progresso(desafio_id):
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)

    parte = DesafioParticipante.query.filter_by(
        desafio_id=desafio_id, user_id=user.id
    ).first()
    if not parte:
        return jsonify({'error': 'Não és participante'}), 403

    progresso_anterior = parte.progresso
    progresso = _calcular_progresso(desafio, user)
    parte.progresso     = progresso
    parte.atualizado_em = datetime.utcnow()
    db.session.commit()

    # Verificar mudança de posição no ranking → notificação push
    ranking = sorted(desafio.participantes.all(), key=lambda p: p.progresso, reverse=True)
    minha_posicao = next((i+1 for i, p in enumerate(ranking) if p.user_id == user.id), None)

    # Notificar quem foi ultrapassado
    if minha_posicao and minha_posicao > 1:
        ultrapassado = ranking[minha_posicao - 2]  # quem estava antes
        if ultrapassado.progresso < progresso and progresso_anterior < ultrapassado.progresso:
            _notificar_ultrapassado(ultrapassado.user, user, desafio)

    return jsonify({
        'progresso': progresso,
        'currency': summarize_expenses(user.id)['currency'],
        'minha_posicao': minha_posicao,
        'ranking': [{'user_id': p.user_id, 'nome': p.user.nome, 'progresso': p.progresso} for p in ranking],
    })


@api_bp.route('/desafios/<int:desafio_id>/terminar', methods=['POST'])
@jwt_required()
def terminar_desafio(desafio_id):
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)

    if desafio.criador_id != user.id:
        return jsonify({'error': 'Só o criador pode terminar o desafio'}), 403

    for parte in desafio.participantes.all():
        parte.progresso = _calcular_progresso(desafio, parte.user)

    ranking = sorted(desafio.participantes.all(), key=lambda p: p.progresso, reverse=True)

    if ranking:
        vencedor = ranking[0]
        vencedor.ganhou = True
        _dar_recompensa_se_nao_existe(
            vencedor.user_id,
            'vencedor_desafio',
            titulo=f'🏆 Vencedor: {desafio.titulo}',
            descricao=desafio.recompensa or 'Ganhaste o desafio!',
            icone='🏆',
            xp=100,
            desafio_id=desafio_id,
        )
        # Badge desafio IA
        if desafio.gerado_ia:
            _dar_recompensa_se_nao_existe(
                vencedor.user_id, 'desafio_ia',
                titulo='Adepto de IA!', descricao='Ganhaste um desafio gerado por IA',
                icone='🤖', xp=30, desafio_id=desafio_id
            )

        _registar_atividade(desafio.grupo_id, vencedor.user_id, 'desafio_terminado',
            f'{vencedor.user.nome} venceu "{desafio.titulo}"!', emoji='🏆')

    desafio.estado = 'terminado'
    db.session.commit()

    return jsonify({
        'ok': True,
        'currency': summarize_expenses(user.id)['currency'],
        'vencedor': {
            'user_id': ranking[0].user_id,
            'nome': ranking[0].user.nome,
            'progresso': ranking[0].progresso,
        } if ranking else None,
        'ranking': [{'user_id': p.user_id, 'nome': p.user.nome, 'progresso': p.progresso, 'ganhou': p.ganhou} for p in ranking],
    })


# ── Recompensas ────────────────────────────────────────────────────────────────

@api_bp.route('/recompensas', methods=['GET'])
@jwt_required()
def listar_recompensas():
    user = _current_user()
    recompensas = (
        Recompensa.query
        .filter_by(user_id=user.id)
        .order_by(Recompensa.ganhou_em.desc())
        .all()
    )
    Recompensa.query.filter_by(user_id=user.id, vista=False).update({'vista': True})
    db.session.commit()

    total_xp = sum(r.xp for r in recompensas)
    nivel_info = _xp_to_nivel(total_xp)

    # Calcular badges disponíveis (não ganhos ainda)
    tipos_ganhos = {r.tipo for r in recompensas}
    badges_disponiveis = {
        k: v for k, v in BADGES.items() if k not in tipos_ganhos
    }

    return jsonify({
        'recompensas': [r.to_dict() for r in recompensas],
        'total_xp': total_xp,
        'nivel': nivel_info,
        'xp_proximo_nivel': _xp_proximo_nivel(total_xp),
        'badges_disponiveis': badges_disponiveis,
        'historico_desafios': _historico_desafios(user.id),
    })


@api_bp.route('/recompensas/novas', methods=['GET'])
@jwt_required()
def recompensas_novas():
    user  = _current_user()
    count = Recompensa.query.filter_by(user_id=user.id, vista=False).count()
    return jsonify({'count': count})


# ── Helpers ────────────────────────────────────────────────────────────────────

def _assert_membro(grupo, user_id):
    row = db.session.execute(
        grupo_membro.select().where(
            grupo_membro.c.grupo_id == grupo.id,
            grupo_membro.c.user_id  == user_id,
        )
    ).fetchone()
    if not row:
        from flask import abort
        abort(403)


def _entrar_desafio(desafio_id, user_id):
    exists = DesafioParticipante.query.filter_by(
        desafio_id=desafio_id, user_id=user_id
    ).first()
    if not exists:
        db.session.add(DesafioParticipante(desafio_id=desafio_id, user_id=user_id))


def _registar_atividade(grupo_id, user_id, tipo, descricao, emoji='📌', valor=None):
    db.session.add(AtividadeGrupo(
        grupo_id=grupo_id,
        user_id=user_id,
        tipo=tipo,
        descricao=descricao,
        emoji=emoji,
        valor=valor,
    ))


def _desafio_payload(desafio, user):
    payload = desafio.to_dict(user.id)
    try:
        summary = summarize_expenses(user.id)
        payload['currency'] = summary['currency']
        payload['financial_context'] = {
            'available_currencies': summary['available_currencies'],
            'excluded_count': summary['excluded']['count'],
        }
    except Exception:
        payload['currency'] = 'EUR'
        payload['financial_context'] = {
            'available_currencies': [],
            'excluded_count': 0,
        }
    return payload


def _calcular_progresso(desafio, user):
    inicio = desafio.inicio.date() if hasattr(desafio.inicio, 'date') else desafio.inicio
    fim = desafio.fim.date() if hasattr(desafio.fim, 'date') else desafio.fim
    summary = summarize_expenses(user.id)
    registos = [
        item for item in summary['records']
        if item['date'] and inicio <= item['date'] <= fim
    ]

    if desafio.tipo == 'gastar_menos':
        total_gasto = sum(item['value'] for item in registos)
        alvo = desafio.valor_alvo or 500
        return max(0, alvo - total_gasto)

    elif desafio.tipo == 'categoria_limite':
        cat = normalize_text(desafio.categoria or '')
        total_cat = sum(
            item['value'] for item in registos
            if normalize_text(item['categoria']) == cat
        )
        alvo = desafio.valor_alvo or 100
        return max(0, alvo - total_cat)

    elif desafio.tipo == 'poupar_valor':
        total_gasto = sum(item['value'] for item in registos)
        orcamento   = user.orcamento_mensal or 0
        return max(0, orcamento - total_gasto)

    elif desafio.tipo == 'streak_dias':
        return float(user.streak_dias or 0)

    return 0.0


def _dar_recompensa_se_nao_existe(user_id, tipo, titulo, descricao, icone, xp, desafio_id=None, cor=None):
    exists = Recompensa.query.filter_by(user_id=user_id, tipo=tipo, desafio_id=desafio_id).first()
    if not exists:
        badge_info = BADGES.get(tipo, {})
        db.session.add(Recompensa(
            user_id=user_id,
            desafio_id=desafio_id,
            tipo=tipo,
            titulo=titulo,
            descricao=descricao,
            icone=icone,
            cor=cor or badge_info.get('cor', '#FFD700'),
            xp=xp,
        ))
        db.session.flush()


def _notificar_ultrapassado(user_ultrapassado, user_que_ultrapassou, desafio):
    """Envia push notification quando alguém é ultrapassado no ranking."""
    try:
        from app.api.push_notifications import _send_push_to_user
        _send_push_to_user(
            user_ultrapassado,
            title='Foste ultrapassado! 📈',
            body=f'{user_que_ultrapassou.nome} está agora à tua frente em "{desafio.titulo}"',
            data={'tipo': 'ranking_mudou', 'desafio_id': desafio.id},
        )
    except Exception:
        pass  # Push é best-effort, não falha o request


def _historico_desafios(user_id):
    """Retorna os desafios em que o utilizador participou."""
    participacoes = (
        DesafioParticipante.query
        .filter_by(user_id=user_id)
        .all()
    )
    resultado = []
    for p in participacoes:
        d = p.desafio
        grupo = Grupo.query.get(d.grupo_id)
        resultado.append({
            'desafio_id': d.id,
            'titulo': d.titulo,
            'estado': d.estado,
            'ganhou': p.ganhou,
            'progresso': p.progresso,
            'grupo_nome': grupo.nome if grupo else '?',
            'grupo_emoji': grupo.emoji if grupo else '👥',
            'fim': d.fim.isoformat(),
        })
    resultado.sort(key=lambda x: x['fim'], reverse=True)
    return resultado


def _xp_to_nivel(xp):
    if xp < 100:   return {'nivel': 1, 'titulo': 'Iniciante',    'icone': '🌱', 'cor': '#81C784'}
    if xp < 300:   return {'nivel': 2, 'titulo': 'Poupador',     'icone': '💰', 'cor': '#FFD54F'}
    if xp < 600:   return {'nivel': 3, 'titulo': 'Estrategista', 'icone': '📊', 'cor': '#4FC3F7'}
    if xp < 1000:  return {'nivel': 4, 'titulo': 'Expert',       'icone': '🎯', 'cor': '#FF8A65'}
    return             {'nivel': 5, 'titulo': 'Mestre',       'icone': '🏆', 'cor': '#CE93D8'}


def _xp_proximo_nivel(xp):
    limites = [100, 300, 600, 1000]
    for limite in limites:
        if xp < limite:
            return limite - xp
    return 0


# ── Helper para push direto a um utilizador ────────────────────────────────────
# (já definida em push_notifications.py mas duplicamos aqui como fallback)
