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
    google_id = db.Column(db.String(128), unique=True)
    avatar_url = db.Column(db.String(512))
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
    moeda_preferida = db.Column(db.String(10), default='EUR')

    email_confirmado     = db.Column(db.Boolean, default=False)
    email_confirm_token  = db.Column(db.String(100))
    email_confirm_expiry = db.Column(db.DateTime)

    faturas            = db.relationship('Fatura',    backref='user', lazy=True, cascade='all, delete-orphan')
    conversas          = db.relationship('Conversa',  backref='user', lazy=True, cascade='all, delete-orphan')
    metas              = db.relationship('Meta',      backref='user', lazy=True, cascade='all, delete-orphan')
    subscricoes        = db.relationship('Subscricao',backref='user', lazy=True, cascade='all, delete-orphan')
    net_worth_items    = db.relationship('NetWorthItem', backref='user', lazy=True, cascade='all, delete-orphan')
    playlists_proprias = db.relationship('Playlist',  backref='owner',lazy=True, cascade='all, delete-orphan')

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

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome_ficheiro = db.Column(db.String(255), nullable=False)
    loja          = db.Column(db.String(150))
    data_compra   = db.Column(db.String(50))
    total         = db.Column(db.Float)
    items         = db.Column(db.Text)
    categoria     = db.Column(db.String(50), default='Outros')
    data_garantia  = db.Column(db.String(50))
    data_devolucao = db.Column(db.String(50))
    notas         = db.Column(db.Text)
    data_upload   = db.Column(db.DateTime, default=datetime.utcnow)
    file_key      = db.Column(db.String(512))   # chave no Cloudflare R2
    gmail_message_id = db.Column(db.String(100), unique=True)
    fonte            = db.Column(db.String(20), default='upload')


class Conversa(db.Model):
    __tablename__ = 'conversas'

    id        = db.Column(db.Integer, primary_key=True)
    user_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    pergunta  = db.Column(db.Text, nullable=False)
    resposta  = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class Meta(db.Model):
    __tablename__ = 'metas'

    id           = db.Column(db.Integer, primary_key=True)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome         = db.Column(db.String(100))
    categoria    = db.Column(db.String(50), nullable=False)
    valor_limite = db.Column(db.Float, nullable=False)
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)


class ContaBancaria(db.Model):
    __tablename__ = 'contas_bancarias'

    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    account_id       = db.Column(db.String(100), nullable=False)
    requisition_id   = db.Column(db.String(100), nullable=False)
    institution_id   = db.Column(db.String(100))
    iban             = db.Column(db.String(50))
    nome_banco       = db.Column(db.String(100))
    ligada_em        = db.Column(db.DateTime, default=datetime.utcnow)
    ativa            = db.Column(db.Boolean, default=True)


class OpenBankingConnection(db.Model):
    __tablename__ = 'open_banking_connections'

    id              = db.Column(db.Integer, primary_key=True)
    user_id         = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    provider        = db.Column(db.String(40), default='enablebanking', nullable=False)
    institution_id  = db.Column(db.String(100), nullable=False)
    requisition_id  = db.Column(db.String(100), unique=True)
    reference       = db.Column(db.String(120), unique=True, nullable=False)
    status          = db.Column(db.String(30), default='created', nullable=False)
    redirect_url    = db.Column(db.String(512))
    agreement_id    = db.Column(db.String(100))
    error           = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_sync_at    = db.Column(db.DateTime)
    consent_expires_at = db.Column(db.DateTime)

    user = db.relationship('User', backref=db.backref('open_banking_connections', lazy=True))


class BankTransaction(db.Model):
    __tablename__ = 'bank_transactions'

    id                 = db.Column(db.Integer, primary_key=True)
    user_id            = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    conta_bancaria_id  = db.Column(db.Integer, db.ForeignKey('contas_bancarias.id'), nullable=False, index=True)
    provider           = db.Column(db.String(40), default='enablebanking', nullable=False)
    transaction_id     = db.Column(db.String(160))
    transaction_hash   = db.Column(db.String(64), unique=True, nullable=False)
    booked_at          = db.Column(db.Date)
    value_date         = db.Column(db.Date)
    amount             = db.Column(db.Float, nullable=False, default=0)
    currency           = db.Column(db.String(10), default='EUR')
    description        = db.Column(db.Text)
    merchant_name      = db.Column(db.String(200))
    categoria          = db.Column(db.String(50), default='Outros')
    raw_json           = db.Column(db.Text)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('bank_transactions', lazy=True))
    conta = db.relationship('ContaBancaria', backref=db.backref('transactions', lazy=True))


family_member = db.Table(
    'family_members',
    db.Column('family_id', db.Integer, db.ForeignKey('family_plans.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('role', db.String(20), default='member'),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
)


class FamilyPlan(db.Model):
    __tablename__ = 'family_plans'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    orcamento_mensal = db.Column(db.Float, default=0)
    currency = db.Column(db.String(10), default='EUR')
    ativo = db.Column(db.Boolean, default=True)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('User', foreign_keys=[owner_id])
    membros = db.relationship('User', secondary=family_member, lazy='dynamic')


class Bill(db.Model):
    __tablename__ = 'bills'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    titulo = db.Column(db.String(160), nullable=False)
    categoria = db.Column(db.String(80), default='Obrigacao')
    valor = db.Column(db.Float, default=0)
    currency = db.Column(db.String(10), default='EUR')
    data_vencimento = db.Column(db.Date, nullable=False, index=True)
    recorrencia = db.Column(db.String(20), default='none')
    notas = db.Column(db.Text)
    pago = db.Column(db.Boolean, default=False)
    lembrar_dias_antes = db.Column(db.Integer, default=3)
    calendar_event_id = db.Column(db.String(160))
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('bills', lazy=True, cascade='all, delete-orphan'))


class CalendarConnection(db.Model):
    __tablename__ = 'calendar_connections'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    provider = db.Column(db.String(30), nullable=False)
    account_email = db.Column(db.String(200))
    status = db.Column(db.String(30), default='not_configured')
    credentials_json = db.Column(db.Text)
    last_sync_at = db.Column(db.DateTime)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('calendar_connections', lazy=True, cascade='all, delete-orphan'))


class RefundOpportunityState(db.Model):
    __tablename__ = 'refund_opportunity_states'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    opportunity_key = db.Column(db.String(220), nullable=False)
    status = db.Column(db.String(30), default='new')
    notes = db.Column(db.Text)
    recovered_amount = db.Column(db.Float, default=0)
    currency = db.Column(db.String(10), default='EUR')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('refund_opportunity_states', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (
        db.UniqueConstraint('user_id', 'opportunity_key', name='uq_refund_state_user_key'),
    )


class Subscricao(db.Model):
    __tablename__ = 'subscricoes'

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome          = db.Column(db.String(200), nullable=False)
    categoria     = db.Column(db.String(50), default='outro')
    icone         = db.Column(db.String(10), default='📦')
    preco_mensal  = db.Column(db.Float, default=0.0)
    meses_pago    = db.Column(db.Integer, default=1)
    risk          = db.Column(db.String(20), default='ok')
    fonte         = db.Column(db.String(20), default='extrato')
    ativa         = db.Column(db.Boolean, default=True)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    criado_em     = db.Column(db.DateTime, default=datetime.utcnow)


class NetWorthItem(db.Model):
    __tablename__ = 'net_worth_items'

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    nome          = db.Column(db.String(160), nullable=False)
    tipo          = db.Column(db.String(20), nullable=False, default='asset')  # asset | liability
    categoria     = db.Column(db.String(80), nullable=False, default='Outros')
    valor         = db.Column(db.Float, nullable=False, default=0)
    currency      = db.Column(db.String(10), default='EUR')
    ativo         = db.Column(db.Boolean, default=True)
    criado_em     = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots = db.relationship('NetWorthSnapshot', backref='item', lazy=True, cascade='all, delete-orphan')


class NetWorthSnapshot(db.Model):
    __tablename__ = 'net_worth_snapshots'

    id            = db.Column(db.Integer, primary_key=True)
    item_id       = db.Column(db.Integer, db.ForeignKey('net_worth_items.id'), nullable=False, index=True)
    valor         = db.Column(db.Float, nullable=False, default=0)
    currency      = db.Column(db.String(10), default='EUR')
    criado_em     = db.Column(db.DateTime, default=datetime.utcnow)


playlist_fatura = db.Table(
    'playlist_fatura',
    db.Column('playlist_id',   db.Integer, db.ForeignKey('playlist.id'), primary_key=True),
    db.Column('fatura_id',     db.Integer, db.ForeignKey('faturas.id'),  primary_key=True),
    db.Column('adicionado_em', db.DateTime, default=datetime.utcnow),
)

playlist_membro = db.Table(
    'playlist_membro',
    db.Column('playlist_id', db.Integer, db.ForeignKey('playlist.id'), primary_key=True),
    db.Column('user_id',     db.Integer, db.ForeignKey('users.id'),    primary_key=True),
    db.Column('papel',       db.String(20), default='editor'),
    db.Column('joined_at',   db.DateTime,   default=datetime.utcnow),
)


class Playlist(db.Model):
    __tablename__ = 'playlist'

    id           = db.Column(db.Integer, primary_key=True)
    nome         = db.Column(db.String(100), nullable=False)
    descricao    = db.Column(db.Text)
    cor          = db.Column(db.String(20), default='#6C5CE7')
    icone        = db.Column(db.String(20), default='list')
    owner_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    codigo       = db.Column(db.String(20), unique=True)
    colaborativa = db.Column(db.Boolean, default=False)
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)

    faturas = db.relationship('Fatura', secondary=playlist_fatura, lazy='dynamic')
    membros = db.relationship('User',   secondary=playlist_membro, lazy='dynamic')


class Amizade(db.Model):
    __tablename__ = 'amizades'

    id           = db.Column(db.Integer, primary_key=True)
    de_user_id   = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    para_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    estado       = db.Column(db.String(20), default='pendente')
    criado_em    = db.Column(db.DateTime, default=datetime.utcnow)

    de_user   = db.relationship('User', foreign_keys=[de_user_id])
    para_user = db.relationship('User', foreign_keys=[para_user_id])


class GmailConnection(db.Model):
    __tablename__ = 'gmail_connections'

    id                 = db.Column(db.Integer, primary_key=True)
    user_id            = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    gmail_email        = db.Column(db.String(200))
    credentials_json   = db.Column(db.Text, nullable=False)
    ativa              = db.Column(db.Boolean, default=True)
    ultima_sync        = db.Column(db.DateTime)
    faturas_importadas = db.Column(db.Integer, default=0)
    criado_em          = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('gmail_connection', uselist=False))


class TokenBlacklist(db.Model):
    __tablename__ = 'token_blacklist'

    id         = db.Column(db.Integer, primary_key=True)
    jti        = db.Column(db.String(36), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
