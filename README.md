# Verly

Verly e uma app financeira pessoal com backend Flask e app mobile React Native/Expo. O objetivo e juntar faturas, banco, Gmail, IA e ferramentas praticas de decisao financeira numa experiencia simples: perceber para onde vai o dinheiro, agir antes de gastar mal, gerir subscricoes, dividir despesas e acompanhar patrimonio.

A app esta desenhada com uma UI dark premium, cards glass subtis, gradientes controlados e uma experiencia mobile-first.

## Estado Atual

Verly inclui hoje:

- dashboard financeiro com cockpit inteligente;
- upload de faturas com OCR/IA;
- importacao Gmail para recibos e compras;
- Open Banking para ligar e sincronizar banco;
- Score de compra com lojas proximas, mapa e comparacao de precos;
- subscricoes detetadas por faturas/Gmail/banco;
- Ask Verly com respostas e acoes dentro da app;
- divisao de despesas estilo Tricount;
- net worth com ativos, dividas e grafico em pizza;
- metas, garantias, historico, estatisticas e relatorios;
- backend API JWT para mobile;
- web Flask/Jinja para areas legacy/admin;
- deploy em Railway com Postgres, Redis, Qdrant e Celery worker.

## Funcionalidades

### Dashboard

O dashboard e a primeira vista financeira da app.

- Gasto mensal e progresso face ao orcamento.
- Metricas de faturas, alertas e variacao mensal.
- Graficos financeiros por categoria, tempo e fontes.
- Cockpit inteligente com score financeiro, qualidade dos dados e acoes recomendadas.
- Upload rapido de fatura por camera, galeria ou ficheiro.
- Empty/loading states em dark mode.

### Cockpit Inteligente

O cockpit analisa dados reais e sugere proximas acoes.

- Sugere ligar fontes quando faltam dados.
- Sugere auditar subscricoes quando encontra recorrencias.
- Sugere usar Score antes da proxima compra.
- Sugere atualizar Net Worth quando ja ha base financeira.
- Encaminha para Metas, Subscricoes, Importar Dados, Score, Net Worth ou Estatisticas.

### Faturas

- Upload via camera, galeria, PDF, imagem ou texto.
- Extracao de loja, valor, data, categoria, garantia e devolucao.
- Guardado em base de dados e opcionalmente Cloudflare R2.
- Indexacao semantica para Ask Verly e pesquisas futuras.
- Lista e detalhe de faturas no mobile.

### Score de Compra

O Score ajuda a avaliar uma compra antes de a fazer.

- Produto, preco, categoria e frequencia de uso.
- Score final com fatores explicaveis.
- Avaliacao de preco vs mercado via IA quando configurado.
- Lojas proximas com Google Places e fallback OpenStreetMap/Overpass.
- Mapa inline e modal de mapa completo.
- Comparacao de precos reais noutras lojas via SerpApi.
- Destaque de loja/preco mais barato.

Variaveis relevantes:

```env
GOOGLE_PLACES_API_KEY=
SERPAPI_KEY=
GROQ_API_KEY=
```

Sem `SERPAPI_KEY`, o Score continua a funcionar, mas nao mostra precos reais de outras lojas.

### Importar Dados

O menu de importacao centraliza fontes externas:

- Banco: Open Banking.
- Gmail: importacao de recibos e confirmacoes de compra.

O objetivo deste ecra e ligar fontes. A analise financeira fica no dashboard, insights e cockpit.

### Open Banking

O Open Banking foi simplificado para cumprir um papel claro:

- Ver estado da ligacao.
- Pesquisar instituicao bancaria.
- Iniciar consentimento no provider.
- Sincronizar movimentos.
- Ver contas ligadas.

Os movimentos bancarios alimentam dashboard, subscricoes, estatisticas, Ask Verly e memoria semantica.

Variaveis principais:

```env
OPEN_BANKING_PROVIDER=enablebanking
OPEN_BANKING_DEFAULT_COUNTRY=PT
OPEN_BANKING_REDIRECT_URL=https://verly-app-production.up.railway.app/api/v1/open-banking/callback
OPEN_BANKING_APP_RETURN_URL=verly://open-banking/callback
ENABLE_BANKING_APP_ID=
ENABLE_BANKING_PRIVATE_KEY=
```

### Gmail

- Liga a conta Gmail por OAuth.
- Procura emails de confirmacao de compra/recibos.
- Extrai faturas automaticamente.
- Permite sincronizar e desligar.
- Alimenta faturas, subscricoes e Ask Verly.

Variaveis principais:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APP_URL=
```

### Subscricoes

Auditoria de pagamentos recorrentes.

- Deteccao por faturas.
- Deteccao por Gmail apos importacao.
- Deteccao por Open Banking quando existem movimentos recorrentes.
- Resumo mensal/anual.
- Risco por subscricao.
- Remocao/ocultacao de subscricoes irrelevantes.
- Estado vazio com CTA para ligar fontes reais.

### Ask Verly

Chat financeiro com contexto dos dados do utilizador.

Usa:

- faturas;
- metas;
- memoria semantica;
- historico recente;
- personalidade do utilizador.

Tambem devolve acoes que o mobile pode executar:

- abrir upload;
- ver faturas;
- ver garantias;
- analisar compra no Score;
- abrir grupos;
- abrir importacao;
- abrir subscricoes;
- abrir Net Worth;
- criar metas com confirmacao;
- criar item de Net Worth com confirmacao;
- limpar conversa.

### Dividir Despesas

Parte social convertida para uma experiencia tipo Tricount.

- Grupos.
- Membros.
- Despesas partilhadas.
- Pagador.
- Participantes.
- Divisao automatica.
- Saldos por pessoa.
- Acertos sugeridos.
- Modal de nova despesa com botao de guardar fixo.

### Net Worth

Funcionalidade de patrimonio liquido.

- Adicionar ativos.
- Adicionar dividas.
- Categorizar itens.
- Total de ativos.
- Total de dividas.
- Net worth liquido.
- Grafico em pizza por categoria de ativos.
- Remocao logica de itens.

Backend:

- modelo `NetWorthItem`;
- endpoints `/api/v1/networth`;
- migration `20260608_0003_networth.py`.

### Metas, Garantias, Estatisticas e Historico

- Metas por categoria e limite mensal.
- Garantias e prazos de devolucao extraidos das faturas.
- Estatisticas por categoria e evolucao mensal.
- Historico filtrado de compras/faturas.

## Stack

### Mobile

| Area | Tecnologia |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Linguagem | JavaScript |
| Navegacao | React Navigation 6 |
| UI | React Native + Expo Linear Gradient |
| Animacoes | Reanimated 4 + Moti |
| Icones | Lucide React Native |
| Graficos/SVG | react-native-svg |
| Mapas | react-native-maps |
| Storage local | AsyncStorage + SecureStore fallback |
| Compras/pro | RevenueCat |
| Push | Firebase Cloud Messaging |
| Camera/ficheiros | expo-image-picker + expo-document-picker |

### Backend

| Area | Tecnologia |
|---|---|
| Framework | Flask |
| API mobile | Flask JWT Extended |
| ORM | SQLAlchemy |
| Migrations | Flask-Migrate / Alembic |
| Base de dados | PostgreSQL em producao, SQLite em desenvolvimento |
| Cache | Flask-Caching + Redis |
| Jobs | Celery + Redis |
| IA | Groq / Llama 3.3 70B |
| RAG | LlamaIndex + Qdrant |
| Embeddings | HuggingFace / sentence-transformers |
| Storage | Cloudflare R2 |
| Email | Resend |
| OAuth | Google |
| Open Banking | Enable Banking |
| Precos externos | SerpApi Google Shopping |
| Deploy | Railway |

## Estrutura

```text
.
|-- app/
|   |-- api/
|   |   |-- __init__.py
|   |   |-- auth.py
|   |   |-- chat.py
|   |   |-- dashboard.py
|   |   |-- faturas.py
|   |   |-- gmail.py
|   |   |-- mobile_extras.py
|   |   |-- networth.py
|   |   |-- open_banking.py
|   |   |-- social.py
|   |   |-- subscricoes.py
|   |   `-- ...
|   |-- tasks/
|   |-- models.py
|   |-- models_social.py
|   |-- financial_intelligence.py
|   |-- financial_records.py
|   |-- open_banking_service.py
|   |-- scoring.py
|   |-- subscriptions.py
|   `-- ...
|-- migrations/
|   `-- versions/
|-- templates/
|-- static/
|-- dados_utilizadores/
|-- storage_utilizadores/
|-- verly-mobile/
|   |-- src/
|   |   |-- components/
|   |   |-- constants/
|   |   |-- context/
|   |   |-- navigation/
|   |   |-- screens/
|   |   |-- services/
|   |   `-- utils/
|   |-- android/
|   |-- package.json
|   `-- app.json
|-- config.py
|-- run.py
|-- Procfile
`-- requirements.txt
```

## Setup Local

### 1. Backend

```powershell
cd c:\projetos\meu-projeto-ai
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Cria um `.env` na raiz.

Minimo para desenvolvimento:

```env
FLASK_ENV=development
SECRET_KEY=dev-secret
JWT_SECRET_KEY=dev-jwt-secret
DATABASE_URL=sqlite:///shopping_police.db
GROQ_API_KEY=
REDIS_URL=redis://localhost:6379/0
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=verly_docs
```

Para funcionalidades completas:

```env
APP_URL=http://localhost:5000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_PLACES_API_KEY=
SERPAPI_KEY=
RESEND_API_KEY=
EMAIL_FROM=Verly <alertas@verlyapp.com>
REVENUECAT_SECRET_KEY=
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
OPEN_BANKING_PROVIDER=enablebanking
OPEN_BANKING_DEFAULT_COUNTRY=PT
OPEN_BANKING_REDIRECT_URL=http://localhost:5000/api/v1/open-banking/callback
OPEN_BANKING_APP_RETURN_URL=verly://open-banking/callback
ENABLE_BANKING_APP_ID=
ENABLE_BANKING_PRIVATE_KEY=
```

Aplica migrations:

```powershell
flask db upgrade
```

Arranca o backend:

```powershell
python run.py
```

Arranca Celery noutra consola:

```powershell
celery -A run.celery worker --loglevel=info -Q default,ocr,ai,emails -c 2
```

### 2. Mobile

```powershell
cd verly-mobile
npm install
```

Android emulator contra backend local:

```powershell
$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:5000/api/v1"
npx expo run:android
```

Telemovel fisico contra backend local:

```powershell
$env:EXPO_PUBLIC_API_URL="http://IP_DO_TEU_PC:5000/api/v1"
npx expo run:android
```

Contra producao:

```powershell
npx expo run:android
```

Por defeito a app usa:

```text
https://verly-app-production.up.railway.app/api/v1
```

Web preview:

```powershell
npx expo start --web
```

## Railway / Producao

Servicos usados:

- `Verly-app`: Flask/Gunicorn.
- `celery-worker`: Celery.
- PostgreSQL.
- Redis.
- Qdrant.

`Procfile` atual:

```text
web: python migrate_prod.py && gunicorn run:flask_app --workers 1 --bind 0.0.0.0:$PORT --timeout 120
```

Comando comum para migrations em Railway:

```bash
flask db upgrade
```

Se necessario:

```bash
export FLASK_APP=run.py
python -m flask db upgrade
```

Depois de alterar variaveis no Railway, faz redeploy/restart do servico.

## Variaveis de Ambiente

### Core

```env
APP_URL=
FLASK_ENV=
SECRET_KEY=
JWT_SECRET_KEY=
DATABASE_URL=
REDIS_URL=
```

### IA e dados

```env
GROQ_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
QDRANT_COLLECTION=
```

### Score e mercado

```env
GOOGLE_PLACES_API_KEY=
SERPAPI_KEY=
```

### Gmail / Google

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Open Banking

```env
OPEN_BANKING_PROVIDER=
OPEN_BANKING_DEFAULT_COUNTRY=
OPEN_BANKING_REDIRECT_URL=
OPEN_BANKING_APP_RETURN_URL=
ENABLE_BANKING_APP_ID=
ENABLE_BANKING_PRIVATE_KEY=
ENABLE_BANKING_PRIVATE_KEY_FILE=
```

### Storage e email

```env
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
RESEND_API_KEY=
EMAIL_FROM=
```

### Monetizacao

```env
REVENUECAT_SECRET_KEY=
```

## API Mobile

Base URL:

```text
/api/v1
```

Principais grupos de endpoints:

- `/auth`: login, registo, refresh, logout, perfil autenticado.
- `/dashboard`: resumo financeiro e cockpit.
- `/faturas`: listar, detalhe, upload e apagar.
- `/chat`: Ask Verly, historico e limpar conversa.
- `/scoring`: Score de compra, lojas proximas e precos.
- `/gmail`: OAuth, status, sync e disconnect.
- `/open-banking`: status, institutions, connect, callback, sync, accounts, transactions.
- `/subscricoes`: listar, detetar e apagar.
- `/grupos`: grupos, despesas, acertos e chat de grupo.
- `/networth`: patrimonio liquido e itens.
- `/metas`: metas financeiras.
- `/estatisticas`: graficos e historico agregado.
- `/exportar`: resumo/garantias/PDF.

## Migrations Importantes

```text
20260606_0001_open_banking.py
20260607_0002_social_expenses.py
20260608_0003_networth.py
```

Sempre que fizeres deploy com novas migrations:

```bash
flask db upgrade
```

## Validacao

Backend:

```powershell
python -m py_compile app\scoring.py app\api\mobile_extras.py app\api\subscricoes.py app\api\networth.py app\api\chat.py app\financial_intelligence.py app\models.py
```

Mobile bundle:

```powershell
cd verly-mobile
npx expo export --platform web --output-dir .expo-web-check
```

Limpar export temporario:

```powershell
Remove-Item -Recurse -Force .expo-web-check
```

## Design System

O design system mobile vive em:

```text
verly-mobile/src/constants/theme.js
```

Direcao visual atual:

- dark premium;
- fundo navy/preto azulado;
- cards glass subtis;
- gradientes roxo/azul/ciano/magenta apenas em destaques;
- bordas finas e sombras discretas;
- bottom navigation moderna;
- componentes densos mas respiraveis;
- microinteracoes curtas;
- tipografia consistente.

Tokens principais:

- `COLORS`
- `FONT`
- `RADIUS`
- `SPACE`
- `SHADOWS`

## Seguranca

Nunca commits ficheiros `.env`, private keys, service accounts ou secrets.

Credenciais que devem ficar apenas em gestores de variaveis:

- `DATABASE_URL`
- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `GROQ_API_KEY`
- `SERPAPI_KEY`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `R2_SECRET_ACCESS_KEY`
- `ENABLE_BANKING_PRIVATE_KEY`
- `REVENUECAT_SECRET_KEY`

Se uma key for colada em chat, issue, README, screenshot ou commit, considera-a exposta e roda/regenera no provider.

## Notas de Operacao

- `SERPAPI_KEY` e opcional, mas necessaria para precos reais no Score.
- `GOOGLE_PLACES_API_KEY` melhora lojas proximas; sem ela ha fallback OpenStreetMap/Overpass.
- `GROQ_API_KEY` e necessaria para respostas IA completas.
- `OPEN_BANKING_*` so e necessario para ligar bancos.
- `AUTO_MIGRATE_ON_STARTUP` pode criar tabelas em desenvolvimento, mas em producao e preferivel gerir migrations explicitamente.

## Licenca

Projeto privado. Todos os direitos reservados.
