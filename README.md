# Verly 💜

**O teu guardião financeiro inteligente.**

Verly é uma aplicação móvel + web que ajuda utilizadores portugueses a gerir as suas despesas, detetar desperdício financeiro e tomar decisões de compra mais inteligentes — com a personalidade irreverente de uma IA que conhece os teus hábitos melhor do que tu.

---

## ✨ Funcionalidades

### 📱 App Mobile (React Native / Expo)
- **Dashboard** — visão geral do mês: gastos, faturas, alertas e tendência vs. mês anterior
- **Faturas** — upload via câmara, galeria ou PDF; extração automática por OCR + IA
- **Ask Verly** — chat com IA contextualizado com os teus dados financeiros pessoais
- **Insights** — análise inteligente dos teus padrões de consumo com alertas, tendências e dicas personalizadas
- **Perfil** — personalidade da IA, avatar, configurações

### 🗂️ Menu Lateral
- **Metas** — define limites de gasto por categoria e acompanha o progresso
- **Amigos** — partilha e compara hábitos com amigos
- **Playlists de compras** — listas colaborativas de produtos
- **Estatísticas** — gráficos detalhados de consumo
- **Relatório** — relatório mensal com estimativa de desperdício
- **Histórico** — todas as faturas ordenadas por data
- **Score de compra** — analisa se uma compra vale a pena antes de a fazer
- **Subscrições** — deteta serviços recorrentes e alerta para os que não usas
- **Notificações** — alertas de garantias e prazos de devolução

### 🌐 Web (Flask + Jinja2)
- Interface completa de gestão de faturas e relatórios
- Exportação PDF de relatórios mensais
- Sistema de personalidade (Savage / Sarcástico / Calmo / Pro)
- Módulo Impulse Control — análise custo-benefício antes de comprar

---

## 🛠️ Stack Tecnológico

### Mobile
| Camada | Tecnologia |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Linguagem | JavaScript (ES2022) |
| Navegação | React Navigation 6 (Stack + Bottom Tabs) |
| Animações | React Native Reanimated 4 + Moti |
| Ícones | Lucide React Native + SVG customizados |
| SVG | react-native-svg 15 |
| Storage local | AsyncStorage |
| Autenticação | Firebase Auth (email, Google, Apple) |
| Compras in-app | RevenueCat |
| Localização | expo-location |
| Câmara / Galeria | expo-image-picker |
| Ficheiros | expo-document-picker |
| HTTP | fetch nativo (via `src/services/api.js`) |

### Backend
| Camada | Tecnologia |
|---|---|
| Linguagem | Python 3.10+ |
| Framework | Flask + Flask-Login + SQLAlchemy |
| Base de dados | SQLite (com sistema de migração próprio) |
| IA / LLM | Meta Llama 3.3 via Groq API |
| Orquestração IA | LlamaIndex |
| Embeddings | HuggingFace BGE Small |
| OCR / Extração | LlamaIndex + Groq multimodal |
| Exportação PDF | ReportLab |
| Autenticação web | Flask-Login + JWT (API mobile) |
| Email | Flask-Mail |

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
│   │   ├── auth.py             # Login, registo, Firebase
│   │   ├── chat.py             # Chat IA
│   │   ├── dashboard.py        # Dados do dashboard
│   │   ├── faturas.py          # Upload e listagem de faturas
│   │   ├── metas.py            # Metas financeiras
│   │   ├── mobile_extras.py    # Score, impulse, relatório, lojas
│   │   ├── subscricoes.py      # Subscrições + RevenueCat
│   │   └── amizades.py         # Sistema social
│   ├── models.py               # Modelos SQLAlchemy
│   ├── ai.py                   # Integração LlamaIndex + Groq
│   ├── email_service.py        # Envio de emails
│   └── ...                     # Outros módulos (scoring, impulse, etc.)
│
├── verly-mobile/               # App React Native / Expo
│   ├── src/
│   │   ├── screens/            # Ecrãs da app
│   │   │   ├── DashboardScreen.js
│   │   │   ├── ChatScreen.js       # "Ask Verly"
│   │   │   ├── InsightsScreen.js   # Insights IA
│   │   │   ├── FaturasScreen.js
│   │   │   ├── PerfilScreen.js
│   │   │   ├── MetasScreen.js
│   │   │   └── ...
│   │   ├── navigation/
│   │   │   └── AppNavigator.js # Stack + Tabs + Menu lateral
│   │   ├── services/
│   │   │   └── api.js          # Comunicação com o backend Flask
│   │   ├── context/
│   │   │   ├── AuthContext.js  # Estado de autenticação global
│   │   │   └── RevenueCatContext.js
│   │   ├── components/
│   │   │   └── UI.js           # Componentes reutilizáveis
│   │   └── constants/
│   │       └── theme.js        # COLORS, FONT, SPACE, RADIUS
│   └── android/                # Build nativo Android
│
├── templates/                  # Templates Jinja2 (web)
├── static/                     # CSS e assets estáticos
├── dados_utilizadores/         # Ficheiros por utilizador (PDFs, imagens)
├── storage_utilizadores/       # Índices vectoriais por utilizador
├── requirements.txt
└── run.py
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
GROQ_API_KEY=your_groq_api_key
FLASK_SECRET_KEY=your_secret_key
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
```

Inicia o servidor:

```bash
python run.py
```

### Mobile

```bash
cd verly-mobile
npm install
```

Em `src/services/api.js`, atualiza o IP para o da tua máquina:

```js
const BASE_URL = 'http://192.168.1.X:5000/api/v1';
```

Inicia a app:

```bash
npx expo start
```

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