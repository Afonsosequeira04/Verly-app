# 🚀 Guia de Sobrevivência do Projeto (Verly)

## 💡 O Conceito (Para não esquecer)
O projeto está dividido em duas partes que têm de trabalhar juntas:
1.  **O Backend (Flask):** É a "Cozinha". É aqui que estão os dados, o login e a IA.
2.  **O Mobile (App):** É o "Empregado de Mesa". É o que tu vês e onde clicas.
*Sem a cozinha aberta (Flask ligado), o empregado (App) não consegue servir nada!*

---

## 🛠️ Ritual de Trabalho (Como ligar tudo)

Deves ter sempre **DOIS TERMINAIS** abertos ao mesmo tempo no VS Code:

### 1. Terminal do Backend (O Cérebro)
Este terminal tem de estar sempre ligado para o login e a base de dados funcionarem.
1. `venv\Scripts\activate` (Ativar o ambiente)
2. `pip install -r requirements.txt` (Garantir que as bibliotecas estão lá)
3. `python run.py` (Ligar o servidor)
*Nota: Deixa-o a correr, não o feches enquanto usares a app.*

### 2. Terminal do Mobile (Os Visuais)
Este terminal envia a app para o teu iPhone.
1. `cd verly-mobile` (Entrar na pasta da app)
2. `npm install` (Só é preciso se mudares de PC ou apagares a pasta node_modules)
3. **Configuração de IP:** Garantir que o IP em `src/services/api.js` é o IP atual do teu PC.
4. `npx expo start -c` (Gerar o QR Code para o iPhone)

---

## 📂 Configuração de Instalação (PC Novo)
Se um dia fores instalar isto noutro computador, os passos são:
1. Criar venv: `python -m venv venv`
2. Instalar Python libs: `pip install -r requirements.txt`
3. Instalar Mobile libs: `cd verly-mobile` -> `npm install`
