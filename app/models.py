from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)
    notificacoes_email = db.Column(db.Boolean, default=False)
    email_notificacoes = db.Column(db.String(150))

    faturas = db.relationship('Fatura', backref='user', lazy=True, cascade='all, delete-orphan')
    conversas = db.relationship('Conversa', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
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


class Conversa(db.Model):
    __tablename__ = 'conversas'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    pergunta = db.Column(db.Text, nullable=False)
    resposta = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
