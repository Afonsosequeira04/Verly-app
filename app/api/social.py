# app/api/social.py — Rotas API para Grupos, Desafios e Recompensas

from datetime import datetime, timedelta
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api  import api_bp
from app      import db
from app.models import User
from app.models_social import (
    Grupo, grupo_membro, Desafio, DesafioParticipante, Recompensa
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

    # Adicionar criador como admin
    db.session.execute(
        grupo_membro.insert().values(grupo_id=grupo.id, user_id=user.id, role='admin')
    )

    # Convidar amigos passados
    for amigo_id in data.get('amigos_ids', []):
        amigo = User.query.get(amigo_id)
        if amigo:
            db.session.execute(
                grupo_membro.insert().values(grupo_id=grupo.id, user_id=amigo_id, role='membro')
            )

    db.session.commit()

    # Recompensa por criar primeiro grupo
    _dar_recompensa_se_nao_existe(user.id, 'primeiro_grupo',
        titulo='Fundador!', descricao='Criaste o teu primeiro grupo', icone='🏅', xp=50)

    return jsonify(grupo.to_dict(user.id)), 201


@api_bp.route('/grupos/<int:grupo_id>', methods=['GET'])
@jwt_required()
def detalhe_grupo(grupo_id):
    user   = _current_user()
    grupo  = Grupo.query.get_or_404(grupo_id)
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


# ── Desafios ───────────────────────────────────────────────────────────────────

@api_bp.route('/grupos/<int:grupo_id>/desafios', methods=['GET'])
@jwt_required()
def listar_desafios(grupo_id):
    user  = _current_user()
    grupo = Grupo.query.get_or_404(grupo_id)
    _assert_membro(grupo, user.id)

    desafios = grupo.desafios.order_by(Desafio.criado_em.desc()).all()
    return jsonify([d.to_dict(user.id) for d in desafios])


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

    # Datas
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
    )
    db.session.add(desafio)
    db.session.flush()

    # Criador entra automaticamente
    _entrar_desafio(desafio.id, user.id)

    # Todos os membros do grupo são convidados automaticamente
    for membro in grupo.membros.all():
        if membro.id != user.id:
            _entrar_desafio(desafio.id, membro.id)

    db.session.commit()
    return jsonify(desafio.to_dict(user.id)), 201


@api_bp.route('/desafios/<int:desafio_id>', methods=['GET'])
@jwt_required()
def detalhe_desafio(desafio_id):
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)
    grupo   = Grupo.query.get(desafio.grupo_id)
    _assert_membro(grupo, user.id)
    return jsonify(desafio.to_dict(user.id))


@api_bp.route('/desafios/<int:desafio_id>/progresso', methods=['POST'])
@jwt_required()
def atualizar_progresso(desafio_id):
    """Atualiza o progresso baseado nas faturas reais do utilizador."""
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)

    parte = DesafioParticipante.query.filter_by(
        desafio_id=desafio_id, user_id=user.id
    ).first()
    if not parte:
        return jsonify({'error': 'Não és participante'}), 403

    progresso = _calcular_progresso(desafio, user)
    parte.progresso    = progresso
    parte.atualizado_em = datetime.utcnow()
    db.session.commit()

    return jsonify({'progresso': progresso})


@api_bp.route('/desafios/<int:desafio_id>/terminar', methods=['POST'])
@jwt_required()
def terminar_desafio(desafio_id):
    """Termina o desafio, calcula vencedor e atribui recompensas."""
    user    = _current_user()
    desafio = Desafio.query.get_or_404(desafio_id)

    if desafio.criador_id != user.id:
        return jsonify({'error': 'Só o criador pode terminar o desafio'}), 403

    # Atualizar progresso de todos
    for parte in desafio.participantes.all():
        parte.progresso = _calcular_progresso(desafio, parte.user)

    # Ordenar por progresso (maior = melhor)
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

    desafio.estado = 'terminado'
    db.session.commit()

    return jsonify({
        'ok': True,
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
    # Marcar como vistas
    Recompensa.query.filter_by(user_id=user.id, vista=False).update({'vista': True})
    db.session.commit()

    total_xp = sum(r.xp for r in recompensas)
    return jsonify({
        'recompensas': [r.to_dict() for r in recompensas],
        'total_xp': total_xp,
        'nivel': _xp_to_nivel(total_xp),
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


def _calcular_progresso(desafio, user):
    """Calcula progresso real baseado nas faturas do utilizador no período do desafio."""
    from app.models import Fatura

    faturas = Fatura.query.filter(
        Fatura.user_id == user.id,
        Fatura.data >= desafio.inicio,
        Fatura.data <= desafio.fim,
    ).all()

    if desafio.tipo == 'gastar_menos':
        # Progresso = quanto poupou vs valor_alvo (menor gasto = melhor)
        total_gasto = sum(f.valor for f in faturas if f.valor > 0)
        alvo = desafio.valor_alvo or 500
        # Score invertido: quanto menos gastou, maior o score
        return max(0, alvo - total_gasto)

    elif desafio.tipo == 'categoria_limite':
        cat = (desafio.categoria or '').lower()
        total_cat = sum(
            f.valor for f in faturas
            if f.valor > 0 and (f.categoria or '').lower() == cat
        )
        alvo = desafio.valor_alvo or 100
        return max(0, alvo - total_cat)

    elif desafio.tipo == 'poupar_valor':
        # Progresso = diferença entre orçamento e gasto (poupança real)
        total_gasto = sum(f.valor for f in faturas if f.valor > 0)
        orcamento   = user.orcamento_mensal or 0
        return max(0, orcamento - total_gasto)

    elif desafio.tipo == 'streak_dias':
        return float(user.streak_dias or 0)

    return 0.0


def _dar_recompensa_se_nao_existe(user_id, tipo, titulo, descricao, icone, xp, desafio_id=None):
    exists = Recompensa.query.filter_by(user_id=user_id, tipo=tipo, desafio_id=desafio_id).first()
    if not exists:
        db.session.add(Recompensa(
            user_id=user_id,
            desafio_id=desafio_id,
            tipo=tipo,
            titulo=titulo,
            descricao=descricao,
            icone=icone,
            xp=xp,
        ))
        db.session.flush()


def _xp_to_nivel(xp):
    if xp < 100:   return {'nivel': 1, 'titulo': 'Iniciante',    'icone': '🌱'}
    if xp < 300:   return {'nivel': 2, 'titulo': 'Poupador',     'icone': '💰'}
    if xp < 600:   return {'nivel': 3, 'titulo': 'Estrategista', 'icone': '📊'}
    if xp < 1000:  return {'nivel': 4, 'titulo': 'Expert',       'icone': '🎯'}
    return             {'nivel': 5, 'titulo': 'Mestre',       'icone': '🏆'}