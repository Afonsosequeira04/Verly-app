# app/models_social.py — Modelos para Grupos, Desafios e Recompensas

from datetime import datetime
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

    criador = db.relationship('User', foreign_keys=[criador_id])
    membros = db.relationship('User', secondary=grupo_membro, lazy='dynamic')
    desafios = db.relationship('Desafio', backref='grupo', lazy='dynamic')

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
        }


# ── Desafios ───────────────────────────────────────────────────────────────────

class Desafio(db.Model):
    __tablename__ = 'desafios'

    id           = db.Column(db.Integer, primary_key=True)
    grupo_id     = db.Column(db.Integer, db.ForeignKey('grupos.id'), nullable=False)
    criador_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    titulo       = db.Column(db.String(150), nullable=False)
    descricao    = db.Column(db.String(500))
    tipo         = db.Column(db.String(30), default='gastar_menos')
    # tipos: 'gastar_menos' | 'poupar_valor' | 'categoria_limite' | 'streak_dias'
    categoria    = db.Column(db.String(100))   # só para tipo 'categoria_limite'
    valor_alvo   = db.Column(db.Float)         # ex: poupar 200€ ou gastar < 100€ em delivery
    inicio       = db.Column(db.DateTime, nullable=False)
    fim          = db.Column(db.DateTime, nullable=False)
    estado       = db.Column(db.String(20), default='ativo')  # 'ativo' | 'terminado' | 'cancelado'
    recompensa   = db.Column(db.String(200))   # descrição da recompensa
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)

    criador      = db.relationship('User', foreign_keys=[criador_id])
    participantes = db.relationship('DesafioParticipante', backref='desafio', lazy='dynamic')

    def to_dict(self, user_id=None):
        participantes = self.participantes.all()
        minha_parte = next((p for p in participantes if p.user_id == user_id), None)
        ranking = sorted(participantes, key=lambda p: p.progresso, reverse=True)
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

    id           = db.Column(db.Integer, primary_key=True)
    desafio_id   = db.Column(db.Integer, db.ForeignKey('desafios.id'), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    progresso    = db.Column(db.Float, default=0)   # valor calculado (ex: € poupados)
    ganhou       = db.Column(db.Boolean, default=False)
    joined_em    = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

    __table_args__ = (db.UniqueConstraint('desafio_id', 'user_id'),)


# ── Recompensas ────────────────────────────────────────────────────────────────

class Recompensa(db.Model):
    __tablename__ = 'recompensas'

    id           = db.Column(db.Integer, primary_key=True)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    desafio_id   = db.Column(db.Integer, db.ForeignKey('desafios.id'), nullable=True)
    tipo         = db.Column(db.String(50), nullable=False)
    # tipos: 'vencedor_desafio' | 'streak_7' | 'streak_30' | 'meta_atingida' | 'primeiro_grupo'
    titulo       = db.Column(db.String(150), nullable=False)
    descricao    = db.Column(db.String(300))
    icone        = db.Column(db.String(10), default='🏆')
    xp           = db.Column(db.Integer, default=0)   # XP ganho
    vista        = db.Column(db.Boolean, default=False)
    ganhou_em    = db.Column(db.DateTime, default=datetime.utcnow)

    user    = db.relationship('User', foreign_keys=[user_id])
    desafio = db.relationship('Desafio', foreign_keys=[desafio_id])

    def to_dict(self):
        return {
            'id': self.id,
            'tipo': self.tipo,
            'titulo': self.titulo,
            'descricao': self.descricao,
            'icone': self.icone,
            'xp': self.xp,
            'vista': self.vista,
            'ganhou_em': self.ganhou_em.isoformat(),
            'desafio_id': self.desafio_id,
        }