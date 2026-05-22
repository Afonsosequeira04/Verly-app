# Verly 💜

**O teu guardião financeiro inteligente.**

Verly é uma aplicação móvel + web que ajuda utilizadores portugueses a gerir as suas despesas, detetar desperdício financeiro e tomar decisões de compra mais inteligentes — com a personalidade irreverente de uma IA que conhece os teus hábitos melhor do que tu.

---

## ✨ Funcionalidades

### 📱 App Mobile (React Native / Expo)
- **Dashboard** — visão geral do mês: gastos, faturas, alertas e tendência vs. mês anterior
- **Faturas** — upload via câmara, galeria ou PDF; extração automática por OCR + IA em background
- **Ask Verly** — chat com IA contextualizado com os teus dados financeiros pessoais
- **Insights** — análise inteligente com cache Redis; gerados em background via Celery com fallback síncrono
- **Poupança** — plano de poupança personalizado com breakdown por categoria
- **Perfil** — personalidade da IA (Savage / Sarcástico / Calmo / Pro), avatar, configurações

### 🗂️ Menu Lateral
- **Metas** — define limites de gasto por categoria e acompanha o progresso em tempo real
- **Amigos** — partilha e compara hábitos financeiros com amigos
- **Playlists de compras** — listas colaborativas de produtos
- **Estatísticas** — gráficos detalhados de consumo por categoria e histórico mensal
- **Relatório** — relatório mensal com estimativa de desperdício e análise de tendências
- **Histórico** — todas as faturas ordenadas por data com filtros
- **Score de compra** — analisa se uma compra vale a pena antes de a fazer
- **Subscrições** — deteta serviços recorrentes automaticamente e alerta para os que não usas
- **Garantias** — alertas de garantias e prazos de devolução
- **Notificações** — push notifications via FCM
- **Gmail** — importação automática de faturas por email

### 🌐 Web (Flask + Jinja2)
- Interface completa de gestão de faturas e relatórios
- Exportação PDF de relatórios mensais
- Sistema de personalidade da IA
- Módulo Impulse Control — análise custo-benefício antes de comprar
- Dashboard com gráficos e métricas financeiras

---

## 🛠️ Stack Tecnológico

### Mobile
| Camada | Tecnologia |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Linguagem | JavaScript (ES2022) |
| Navegação | React Navigation 6 (Stack + Bottom Tabs + Drawer) |
| Animações | React Native Reanimated 4 + Moti |
| Ícones | Lucide React Native + SVG customizados |
| SVG | react-native-svg 15 |
| Storage local | AsyncStorage |
| Autenticação | Firebase Auth (email, Google, Apple) |
| Compras in-app | RevenueCat |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Câmara / Galeria | expo-image-picker |
| Ficheiros | expo-document-picker |
| HTTP | fetch nativo (via `src/services/api.js`) |

### Backend
| Camada | Tecnologia |
|---|---|
| Linguagem | Python 3.13 |
| Framework | Flask 3.1 + Flask-Login + SQLAlchemy 2.0 |
| Base de dados | PostgreSQL (produção) / SQLite (desenvolvimento) |
| Cache | Redis + Flask-Caching (dashboard 5min, insights 15min) |
| Tasks em background | Celery 5.4 + Redis broker (OCR, insights IA, emails, indexação) |
| Rate limiting | Flask-Limiter + Redis (multi-worker safe) |
| IA / LLM | Meta Llama 3.3 70B via Groq API |
| Orquestração IA | LlamaIndex 0.14 |
| Vector Search | Qdrant (RAG por utilizador) |
| Embeddings | HuggingFace BGE Small + sentence-transformers |
| OCR / Extração | LlamaIndex + Groq multimodal |
| Storage ficheiros | Cloudflare R2 (S3-compatible) |
| Autenticação API | JWT (access 15min + refresh 30 dias) com blacklist Redis |
| Email | Resend API |
| Exportação PDF | ReportLab |
| Deploy | Railway (Flask + Celery worker separados) |

### Frontend Web
| Camada | Tecnologia |
|---|---|
| Templates | Jinja2 |
| CSS | CSS puro com variáveis (dark mode) |
| Tipografia | Sora + Inter |

---

## 📁 Estrutura do Projeto

```
verly/
├── app/                        # Backend Flask
│   ├── api/                    # Endpoints REST para mobile (JWT)
│   │   ├── __init__.py         # Blueprint da API
│   │   ├── auth.py             # Login, registo, Firebase, refresh tokens
│   │   ├── chat.py             # Chat IA contextualizado
│   │   ├── dashboard.py        # Dados do dashboard (cache Redis)
│   │   ├── faturas.py          # Upload R2 + OCR async via Celery
│   │   ├── insights.py         # Insights IA (cache + Celery dispatch)
│   │   ├── metas.py            # Metas financeiras
│   │   ├── mobile_extras.py    # Score, impulse, relatório, lojas
│   │   ├── subscricoes.py      # Subscrições + RevenueCat
│   │   ├── amizades.py         # Sistema social
│   │   ├── playlists.py        # Playlists colaborativas
│   │   ├── gmail.py            # Importação Gmail
│   │   └── push_notifications.py # FCM push notifications
│   ├── tasks/                  # Tasks Celery em background
│   │   ├── ocr.py              # Processamento OCR assíncrono
│   │   ├── ai_insights.py      # Geração de insights IA
│   │   ├── emails.py           # Envio de emails via Resend
│   │   └── qdrant_task.py      # Indexação vectorial no Qdrant
│   ├── models.py               # Modelos SQLAlchemy (User, Fatura, Meta, etc.)
│   ├── extensions.py           # Cache, Limiter, Redis client, R2 client
│   ├── celery_app.py           # Factory Celery com contexto Flask
│   ├── r2_service.py           # Upload/download/signed URLs Cloudflare R2
│   ├── qdrant_service.py       # Integração LlamaIndex + Qdrant (RAG)
│   ├── ai.py                   # Integração LlamaIndex + Groq
│   ├── email_service.py        # Serviço de email
│   └── ...                     # Outros módulos (scoring, impulse, etc.)
│
├── verly-mobile/               # App React Native / Expo
│   ├── src/
│   │   ├── screens/            # Ecrãs da app
│   │   │   ├── DashboardScreen.js
│   │   │   ├── ChatScreen.js
│   │   │   ├── InsightsScreen.js
│   │   │   ├── FaturasScreen.js
│   │   │   ├── PerfilScreen.js
│   │   │   ├── MetasScreen.js
│   │   │   ├── ScoreScreen.js
│   │   │   ├── GarantiasScreen.js
│   │   │   ├── GmailScreen.js
│   │   │   └── ...
│   │   ├── navigation/
│   │   │   └── AppNavigator.js # Stack + Tabs + Drawer
│   │   ├── services/
│   │   │   └── api.js          # Comunicação com backend Flask
│   │   ├── context/
│   │   │   ├── AuthContext.js  # JWT + refresh tokens
│   │   │   └── RevenueCatContext.js
│   │   ├── components/
│   │   │   ├── UI.js           # Componentes reutilizáveis
│   │   │   ├── DonutCategorias.js
│   │   │   └── DraggableDashboard.js
│   │   └── constants/
│   │       └── theme.js        # COLORS, FONT, SPACE, RADIUS
│   └── android/                # Build nativo Android
│
├── templates/                  # Templates Jinja2 (web)
├── static/                     # CSS e assets estáticos
├── dados_utilizadores/         # Ficheiros por utilizador (PDFs, imagens)
├── config.py                   # Configuração por ambiente
├── run.py                      # Entry point Flask + Celery
└── requirements.txt
```

---

## 🚀 Instalação e Setup

### Backend

```bash
git clone https://github.com/your-username/verly.git
cd verly

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Cria um ficheiro `.env` na raiz:

```env
# Core
FLASK_ENV=development
SECRET_KEY=your_secret_key
JWT_SECRET_KEY=your_jwt_secret

# Base de dados
DATABASE_URL=sqlite:///shopping_police.db  # ou postgresql://...

# IA
GROQ_API_KEY=your_groq_api_key

# Redis (obrigatório para cache, rate limiting e Celery)
REDIS_URL=redis://localhost:6379/0

# Qdrant (vector search)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=verly_docs

# Cloudflare R2 (opcional — sem isto os uploads ficam locais)
R2_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=verly-docs

# Email
RESEND_API_KEY=your_resend_key
EMAIL_FROM=Verly <alertas@verly.app>

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# RevenueCat
REVENUECAT_SECRET_KEY=
```

Inicia o Redis e o Qdrant (requer Docker):

```bash
docker run -d -p 6379:6379 redis:7-alpine
docker run -d -p 6333:6333 qdrant/qdrant
```

Inicia o servidor Flask:

```bash
python run.py
```

Inicia o Celery worker (noutra janela):

```bash
celery -A run.celery worker --loglevel=info -Q default,ocr,ai,emails -c 2
```

### Mobile

```bash
cd verly-mobile
npm install
```

Em `src/services/api.js`, atualiza o URL base:

```js
const BASE_URL = 'http://192.168.1.X:5000/api/v1';  // desenvolvimento local
// ou
const BASE_URL = 'https://verly-app-production.up.railway.app/api/v1';  // produção
```

Inicia a app:

```bash
npx expo start
```

---

## 🚢 Deploy (Railway)

O projeto usa dois serviços no Railway:

| Serviço | Start Command |
|---|---|
| Verly-app (Flask) | `python migrate_prod.py && gunicorn run:app --workers 1 --bind 0.0.0.0:$PORT --timeout 120` |
| Celery worker | `celery -A run.celery worker --loglevel=info -Q default,ocr,ai,emails -c 2` |

Serviços de infraestrutura no Railway: **PostgreSQL**, **Redis**, **Qdrant**.

---

## 🎨 Design System

A app usa um sistema de design consistente definido em `src/constants/theme.js`:

- **Cor primária:** `#7C6FE0` (roxo Verly)
- **Background:** `#080810` (dark profundo)
- **Surface:** `#0F0F1A` / `#161624`
- **Tipografia:** FONT.xs / sm / md / lg / xl / h1
- **Espaçamento:** SPACE.sm / md / lg
- **Raios:** RADIUS.sm / md / lg

---

## 📄 Licença

Projeto privado — todos os direitos reservados.