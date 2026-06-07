# app/models_social.py — Modelos para Grupos, Desafios, Recompensas, Chat, Feed, Streaks

from datetime import datetime, date
from app import db


# ── Grupos ─────────────────────────────────────────────────────────────────────

grupo_membro = db.Table('grupo_membros',
    db.Column('grupo_id', db.Integer, db.ForeignKey('grupos.id'), primary_key=True),
    db.Column('user_id',  db.Integer, db.ForeignKey('users.id'),  primary_key=True),
    db.Column('role',     db.String(20), default='membro'),   # 'admin' | 'membro'
    db.Column('joined_em', db.DateTime, default=datetime.utcnow),
)


class Grupo(db.Model):
    __tablename__ = 'grupos'

    id           = db.Column(db.Integer, primary_key=True)
    nome         = db.Column(db.String(100), nullable=False)
    descricao    = db.Column(db.String(300))
    emoji        = db.Column(db.String(10), default='👥')
    criador_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)
    ativo        = db.Column(db.Boolean, default=True)
    # Streak de grupo
    streak_dias         = db.Column(db.Integer, default=0)
    streak_ultima_data  = db.Column(db.DateTime, nullable=True)

    criador  = db.relationship('User', foreign_keys=[criador_id])
    membros  = db.relationship('User', secondary=grupo_membro, lazy='dynamic')
    desafios = db.relationship('Desafio', backref='grupo', lazy='dynamic')
    mensagens = db.relationship('MensagemGrupo', backref='grupo', lazy='dynamic')
    atividades = db.relationship('AtividadeGrupo', backref='grupo', lazy='dynamic')
    despesas = db.relationship('DespesaGrupo', backref='grupo', lazy='dynamic')

    def to_dict(self, user_id=None):
        membros_list = []
        for m in self.membros.all():
            membros_list.append({
                'id': m.id,
                'nome': m.nome,
                'avatar': m.avatar,
            })
        return {
            'id': self.id,
            'nome': self.nome,
            'descricao': self.descricao,
            'emoji': self.emoji,
            'criador_id': self.criador_id,
            'membros': membros_list,
            'total_membros': len(membros_list),
            'criado_em': self.criado_em.isoformat(),
            'sou_admin': user_id == self.criador_id,
            'streak_dias': self.streak_dias or 0,
        }


# ── Despesas partilhadas ──────────────────────────────────────────────────────

class DespesaGrupo(db.Model):
    __tablename__ = 'despesas_grupo'

    id            = db.Column(db.Integer, primary_key=True)
    grupo_id      = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    pagador_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    criado_por_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    descricao     = db.Column(db.String(180), nullable=False)
    categoria     = db.Column(db.String(80), default='Geral')
    valor         = db.Column(db.Float, nullable=False)
    data          = db.Column(db.Date, nullable=False, default=date.today)
    notas         = db.Column(db.String(500))
    ativo         = db.Column(db.Boolean, default=True)
    criado_em     = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pagador = db.relationship('User', foreign_keys=[pagador_id])
    criado_por = db.relationship('User', foreign_keys=[criado_por_id])
    participantes = db.relationship(
        'DespesaGrupoParticipante',
        backref='despesa',
        lazy='dynamic',
        cascade='all, delete-orphan',
    )

    def to_dict(self, user_id=None):
        participantes = self.participantes.all()
        minha_parte = next((p.valor for p in participantes if p.user_id == user_id), 0)
        return {
            'id': self.id,
            'grupo_id': self.grupo_id,
            'descricao': self.descricao,
            'categoria': self.categoria or 'Geral',
            'valor': round(float(self.valor or 0), 2),
            'data': self.data.isoformat() if self.data else None,
            'notas': self.notas,
            'pagador_id': self.pagador_id,
            'pagador': {
                'id': self.pagador.id,
                'nome': self.pagador.nome,
                'avatar': self.pagador.avatar,
            } if self.pagador else None,
            'criado_por_id': self.criado_por_id,
            'participantes': [p.to_dict() for p in participantes],
            'total_participantes': len(participantes),
            'minha_parte': round(float(minha_parte or 0), 2),
            'eu_paguei': self.pagador_id == user_id,
            'pode_apagar': self.criado_por_id == user_id or self.pagador_id == user_id,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
        }


class DespesaGrupoParticipante(db.Model):
    __tablename__ = 'despesa_grupo_participantes'

    id         = db.Column(db.Integer, primary_key=True)
    despesa_id = db.Column(db.Integer, db.ForeignKey('despesas_grupo.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    valor      = db.Column(db.Float, nullable=False)
    liquidado  = db.Column(db.Boolean, default=False)

    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (db.UniqueConstraint('despesa_id', 'user_id'),)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'nome': self.user.nome if self.user else '?',
            'avatar': self.user.avatar if self.user else None,
            'valor': round(float(self.valor or 0), 2),
            'liquidado': bool(self.liquidado),
        }


# ── Chat do Grupo ──────────────────────────────────────────────────────────────

class MensagemGrupo(db.Model):
    __tablename__ = 'mensagens_grupo'

    id         = db.Column(db.Integer, primary_key=True)
    grupo_id   = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    texto      = db.Column(db.String(1000), nullable=False)
    enviada_em = db.Column(db.DateTime, default=datetime.utcnow)

    autor    = db.relationship('User', foreign_keys=[user_id])
    reacoes  = db.relationship('ReacaoMensagem', backref='mensagem', lazy='dynamic')

    def to_dict(self, user_id=None):
        reacoes_raw = self.reacoes.all()
        # Agrupa: { '🔥': [user_ids...] }
        reacoes_dict = {}
        for r in reacoes_raw:
            reacoes_dict.setdefault(r.emoji, []).append(r.user_id)
        return {
            'id': self.id,
            'grupo_id': self.grupo_id,
            'user_id': self.user_id,
            'nome_autor': self.autor.nome if self.autor else '?',
            'avatar_autor': self.autor.avatar if self.autor else None,
            'texto': self.texto,
            'enviada_em': self.enviada_em.isoformat(),
            'reacoes': reacoes_dict,
            'minha': self.user_id == user_id,
        }


class ReacaoMensagem(db.Model):
    __tablename__ = 'reacoes_mensagem'

    id           = db.Column(db.Integer, primary_key=True)
    mensagem_id  = db.Column(db.Integer, db.ForeignKey('mensagens_grupo.id'), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    emoji        = db.Column(db.String(10), nullable=False)
    criada_em    = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('mensagem_id', 'user_id', 'emoji'),)


# ── Feed de Atividade ──────────────────────────────────────────────────────────

class AtividadeGrupo(db.Model):
    __tablename__ = 'atividades_grupo'

    id         = db.Column(db.Integer, primary_key=True)
    grupo_id   = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    tipo       = db.Column(db.String(50), nullable=False)
    # tipos: 'fatura_adicionada' | 'meta_atingida' | 'desafio_criado' | 'membro_entrou' | 'ranking_mudou'
    descricao  = db.Column(db.String(300))
    valor      = db.Column(db.Float, nullable=True)    # ex: valor da fatura
    emoji      = db.Column(db.String(10), default='📌')
    criada_em  = db.Column(db.DateTime, default=datetime.utcnow)

    autor = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'grupo_id': self.grupo_id,
            'user_id': self.user_id,
            'nome_autor': self.autor.nome if self.autor else '?',
            'avatar_autor': self.autor.avatar if self.autor else None,
            'tipo': self.tipo,
            'descricao': self.descricao,
            'valor': self.valor,
            'emoji': self.emoji,
            'criada_em': self.criada_em.isoformat(),
        }


# ── Streak de Grupo ────────────────────────────────────────────────────────────

class StreakMembroGrupo(db.Model):
    """Registo diário: se cada membro cumpriu o objetivo neste dia."""
    __tablename__ = 'streak_membro_grupo'

    id         = db.Column(db.Integer, primary_key=True)
    grupo_id   = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    data       = db.Column(db.Date,    nullable=False)
    cumpriu    = db.Column(db.Boolean, default=False)

    __table_args__ = (db.UniqueConstraint('grupo_id', 'user_id', 'data'),)


# ── Desafios ───────────────────────────────────────────────────────────────────

class Desafio(db.Model):
    __tablename__ = 'desafios'

    id           = db.Column(db.Integer, primary_key=True)
    grupo_id     = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    criador_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    titulo       = db.Column(db.String(150), nullable=False)
    descricao    = db.Column(db.String(500))
    tipo         = db.Column(db.String(30), default='gastar_menos')
    # tipos: 'gastar_menos' | 'poupar_valor' | 'categoria_limite' | 'streak_dias' | 'ia'
    categoria    = db.Column(db.String(100))
    valor_alvo   = db.Column(db.Float)
    inicio       = db.Column(db.DateTime, nullable=False)
    fim          = db.Column(db.DateTime, nullable=False)
    estado       = db.Column(db.String(20), default='ativo')  # 'ativo' | 'terminado' | 'cancelado'
    recompensa   = db.Column(db.String(200))
    gerado_ia    = db.Column(db.Boolean, default=False)       # foi gerado por IA?
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)

    criador       = db.relationship('User', foreign_keys=[criador_id])
    participantes = db.relationship('DesafioParticipante', backref='desafio', lazy='dynamic')

    def to_dict(self, user_id=None):
        from datetime import datetime as dt
        participantes = self.participantes.all()
        minha_parte = next((p for p in participantes if p.user_id == user_id), None)
        ranking = sorted(participantes, key=lambda p: p.progresso, reverse=True)

        agora = dt.utcnow()
        segundos_restantes = max(0, int((self.fim - agora).total_seconds())) if self.fim > agora else 0

        return {
            'id': self.id,
            'grupo_id': self.grupo_id,
            'titulo': self.titulo,
            'descricao': self.descricao,
            'tipo': self.tipo,
            'categoria': self.categoria,
            'valor_alvo': self.valor_alvo,
            'inicio': self.inicio.isoformat(),
            'fim': self.fim.isoformat(),
            'estado': self.estado,
            'recompensa': self.recompensa,
            'gerado_ia': self.gerado_ia,
            'segundos_restantes': segundos_restantes,
            'total_participantes': len(participantes),
            'meu_progresso': minha_parte.progresso if minha_parte else 0,
            'minha_posicao': next((i+1 for i, p in enumerate(ranking) if p.user_id == user_id), None),
            'ranking': [
                {
                    'user_id': p.user_id,
                    'nome': p.user.nome,
                    'avatar': p.user.avatar,
                    'progresso': p.progresso,
                    'ganhou': p.ganhou,
                }
                for p in ranking
            ],
        }


class DesafioParticipante(db.Model):
    __tablename__ = 'desafio_participantes'

    id            = db.Column(db.Integer, primary_key=True)
    desafio_id    = db.Column(db.Integer, db.ForeignKey('desafios.id'), nullable=False)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    progresso     = db.Column(db.Float, default=0)
    ganhou        = db.Column(db.Boolean, default=False)
    joined_em     = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (db.UniqueConstraint('desafio_id', 'user_id'),)


# ── Recompensas ────────────────────────────────────────────────────────────────

BADGES = {
    'vencedor_desafio':  {'titulo': 'Vencedor!',         'icone': '🏆', 'cor': '#FFD700', 'descricao': 'Ganhaste um desafio'},
    'primeiro_grupo':    {'titulo': 'Fundador',           'icone': '🏅', 'cor': '#C0C0C0', 'descricao': 'Criaste o teu primeiro grupo'},
    'streak_7':          {'titulo': 'Consistente',        'icone': '🔥', 'cor': '#FF6B35', 'descricao': 'Streak de 7 dias'},
    'streak_30':         {'titulo': 'Imparável',          'icone': '⚡', 'cor': '#6C5CE7', 'descricao': 'Streak de 30 dias'},
    'meta_atingida':     {'titulo': 'Focado',             'icone': '🎯', 'cor': '#00B894', 'descricao': 'Atingiste uma meta'},
    'poupar_100':        {'titulo': 'Poupador',           'icone': '💰', 'cor': '#FDCB6E', 'descricao': 'Poupaste 100€'},
    'poupar_500':        {'titulo': 'Investidor',         'icone': '📈', 'cor': '#0984E3', 'descricao': 'Poupaste 500€'},
    'streak_grupo_7':    {'titulo': 'Equipa Unida',       'icone': '🤝', 'cor': '#E17055', 'descricao': 'Streak de grupo de 7 dias'},
    'desafio_ia':        {'titulo': 'Adepto de IA',       'icone': '🤖', 'cor': '#A29BFE', 'descricao': 'Completaste um desafio gerado por IA'},
}


class Recompensa(db.Model):
    __tablename__ = 'recompensas'

    id           = db.Column(db.Integer, primary_key=True)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    desafio_id   = db.Column(db.Integer, db.ForeignKey('desafios.id'), nullable=True)
    tipo         = db.Column(db.String(50), nullable=False)
    titulo       = db.Column(db.String(150), nullable=False)
    descricao    = db.Column(db.String(300))
    icone        = db.Column(db.String(10), default='🏆')
    cor          = db.Column(db.String(10), default='#FFD700')
    xp           = db.Column(db.Integer, default=0)
    vista        = db.Column(db.Boolean, default=False)
    ganhou_em    = db.Column(db.DateTime, default=datetime.utcnow)

    user    = db.relationship('User', foreign_keys=[user_id])
    desafio = db.relationship('Desafio', foreign_keys=[desafio_id])

    def to_dict(self):
        badge_info = BADGES.get(self.tipo, {})
        return {
            'id': self.id,
            'tipo': self.tipo,
            'titulo': self.titulo,
            'descricao': self.descricao,
            'icone': self.icone,
            'cor': self.cor or badge_info.get('cor', '#FFD700'),
            'xp': self.xp,
            'vista': self.vista,
            'ganhou_em': self.ganhou_em.isoformat(),
            'desafio_id': self.desafio_id,
        }
