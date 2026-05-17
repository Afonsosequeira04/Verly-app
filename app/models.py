from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False, default='')
    google_id = db.Column(db.String(128), unique=True)           # ← Google OAuth
    avatar_url = db.Column(db.String(512))                       # ← foto de perfil (URL ou base64 key)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)
    notificacoes_email = db.Column(db.Boolean, default=False)
    email_notificacoes = db.Column(db.String(150))
    personalidade = db.Column(db.String(20), default='calm')
    orcamento_mensal = db.Column(db.Float, default=0)
    onboarding_completo = db.Column(db.Boolean, default=False)
    avatar = db.Column(db.String(255))
    streak_dias = db.Column(db.Integer, default=0)
    streak_ultima_atualizacao = db.Column(db.DateTime)
    lingua = db.Column(db.String(10), default='pt')

    # ── Confirmação de email ────────────────────────────────────────────────────
    email_confirmado     = db.Column(db.Boolean, default=False)
    email_confirm_token  = db.Column(db.String(100))
    email_confirm_expiry = db.Column(db.DateTime)

    faturas = db.relationship('Fatura', backref='user', lazy=True, cascade='all, delete-orphan')
    conversas = db.relationship('Conversa', backref='user', lazy=True, cascade='all, delete-orphan')
    metas = db.relationship('Meta', backref='user', lazy=True, cascade='all, delete-orphan')
    subscricoes = db.relationship('Subscricao', backref='user', lazy=True, cascade='all, delete-orphan')
    playlists_proprias = db.relationship('Playlist', backref='owner', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)


CATEGORIAS = [
    'Tecnologia', 'Alimentação', 'Vestuário', 'Casa & Decoração',
    'Saúde & Beleza', 'Desporto', 'Entretenimento', 'Transportes',
    'Educação', 'Outros',
]


class Fatura(db.Model):
    __tablename__ = 'faturas'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome_ficheiro = db.Column(db.String(255), nullable=False)
    loja = db.Column(db.String(150))
    data_compra = db.Column(db.String(50))
    total = db.Column(db.Float)
    items = db.Column(db.Text)
    categoria = db.Column(db.String(50), default='Outros')
    data_garantia = db.Column(db.String(50))
    data_devolucao = db.Column(db.String(50))
    notas = db.Column(db.Text)
    data_upload = db.Column(db.DateTime, default=datetime.utcnow)
    # ── Gmail import ────────────────────────────────────────────────────────────
    gmail_message_id = db.Column(db.String(100), unique=True)   # evita duplicados
    fonte = db.Column(db.String(20), default='upload')          # 'upload' | 'gmail'


class Conversa(db.Model):
    __tablename__ = 'conversas'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    pergunta = db.Column(db.Text, nullable=False)
    resposta = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class Meta(db.Model):
    __tablename__ = 'metas'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome = db.Column(db.String(100))          # ← campo nome que estava a faltar
    categoria = db.Column(db.String(50), nullable=False)
    valor_limite = db.Column(db.Float, nullable=False)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)


class ContaBancaria(db.Model):
    __tablename__ = 'contas_bancarias'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    account_id = db.Column(db.String(100), nullable=False)
    requisition_id = db.Column(db.String(100), nullable=False)
    institution_id = db.Column(db.String(100))
    iban = db.Column(db.String(50))
    nome_banco = db.Column(db.String(100))
    ligada_em = db.Column(db.DateTime, default=datetime.utcnow)


class Subscricao(db.Model):
    __tablename__ = 'subscricoes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome = db.Column(db.String(200), nullable=False)
    categoria = db.Column(db.String(50), default='outro')
    icone = db.Column(db.String(10), default='📦')
    preco_mensal = db.Column(db.Float, default=0.0)
    meses_pago = db.Column(db.Integer, default=1)
    risk = db.Column(db.String(20), default='ok')
    fonte = db.Column(db.String(20), default='extrato')
    ativa = db.Column(db.Boolean, default=True)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)


# ── Playlists ("Criar Em") ─────────────────────────────────────────────────────

playlist_fatura = db.Table(
    'playlist_fatura',
    db.Column('playlist_id', db.Integer, db.ForeignKey('playlist.id'), primary_key=True),
    db.Column('fatura_id',   db.Integer, db.ForeignKey('faturas.id'),  primary_key=True),
    db.Column('adicionado_em', db.DateTime, default=datetime.utcnow),
)

playlist_membro = db.Table(
    'playlist_membro',
    db.Column('playlist_id', db.Integer, db.ForeignKey('playlist.id'),  primary_key=True),
    db.Column('user_id',     db.Integer, db.ForeignKey('users.id'),     primary_key=True),
    db.Column('papel',       db.String(20), default='editor'),
    db.Column('joined_at',   db.DateTime,   default=datetime.utcnow),
)


class Playlist(db.Model):
    __tablename__ = 'playlist'

    id          = db.Column(db.Integer, primary_key=True)
    nome        = db.Column(db.String(100), nullable=False)
    descricao   = db.Column(db.Text)
    cor         = db.Column(db.String(20), default='#6C5CE7')
    icone       = db.Column(db.String(20), default='list')
    owner_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    codigo      = db.Column(db.String(20), unique=True)
    colaborativa = db.Column(db.Boolean, default=False)
    criado_em   = db.Column(db.DateTime, default=datetime.utcnow)

    faturas = db.relationship('Fatura', secondary=playlist_fatura, lazy='dynamic')
    membros = db.relationship('User',   secondary=playlist_membro, lazy='dynamic')


# ── Amizades / Conexões ────────────────────────────────────────────────────────

class Amizade(db.Model):
    __tablename__ = 'amizades'

    id           = db.Column(db.Integer, primary_key=True)
    de_user_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    para_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    estado       = db.Column(db.String(20), default='pendente')  # pendente | aceite | bloqueado
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)

    de_user   = db.relationship('User', foreign_keys=[de_user_id])
    para_user = db.relationship('User', foreign_keys=[para_user_id])


# ── Gmail Integration ──────────────────────────────────────────────────────────

class GmailConnection(db.Model):
    __tablename__ = 'gmail_connections'

    id                 = db.Column(db.Integer, primary_key=True)
    user_id            = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    gmail_email        = db.Column(db.String(200))
    credentials_json   = db.Column(db.Text, nullable=False)   # JSON com token + refresh_token
    ativa              = db.Column(db.Boolean, default=True)
    ultima_sync        = db.Column(db.DateTime)
    faturas_importadas = db.Column(db.Integer, default=0)
    criado_em          = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('gmail_connection', uselist=False))