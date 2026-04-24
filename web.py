import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template_string

from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings, StorageContext, load_index_from_storage
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

load_dotenv()
groq_api_key = os.getenv("GROQ_API_KEY")

Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=groq_api_key)
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

PASTA_INDICE = "./storage"

# Carregar índice
if os.path.exists(PASTA_INDICE):
    storage_context = StorageContext.from_defaults(persist_dir=PASTA_INDICE)
    index = load_index_from_storage(storage_context)
else:
    reader = SimpleDirectoryReader("./dados")
    documentos = reader.load_data()
    index = VectorStoreIndex.from_documents(documentos)
    index.storage_context.persist(persist_dir=PASTA_INDICE)

chat_engine = index.as_chat_engine(
    chat_mode="condense_plus_context",
    similarity_top_k=20,
    system_prompt=(
        "You are a data analyst assistant. Answer always in the same language as the question. "
        "Be specific and use the data provided. If the data is available, show exact numbers and stats."
    )
)

app = Flask(__name__)

HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Chat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; height: 100vh; display: flex; flex-direction: column; }
        h1 { text-align: center; padding: 20px; color: #e94560; }
        #chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .message { max-width: 70%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; }
        .user { background: #e94560; align-self: flex-end; }
        .bot { background: #16213e; align-self: flex-start; }
        #input-area { display: flex; padding: 20px; gap: 10px; background: #16213e; }
        #input { flex: 1; padding: 12px; border-radius: 8px; border: none; background: #0f3460; color: #eee; font-size: 16px; }
        #input:focus { outline: 2px solid #e94560; }
        button { padding: 12px 24px; background: #e94560; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
        button:hover { background: #c73652; }
        .loading { opacity: 0.6; font-style: italic; }
    </style>
</head>
<body>
    <h1>🤖 RAG Chat</h1>
    <div id="chat"></div>
    <div id="input-area">
        <input id="input" type="text" placeholder="Ask something about your data..." autofocus />
        <button onclick="sendMessage()">Send</button>
    </div>
    <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');

        input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

        function addMessage(text, type) {
            const div = document.createElement('div');
            div.className = `message ${type}`;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }

        async function sendMessage() {
            const question = input.value.trim();
            if (!question) return;
            input.value = '';
            addMessage(question, 'user');
            const loading = addMessage('Thinking...', 'bot loading');
            try {
                const res = await fetch('/ask', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question })
                });
                const data = await res.json();
                loading.textContent = data.answer;
                loading.classList.remove('loading');
            } catch {
                loading.textContent = '❌ Error getting response.';
                loading.classList.remove('loading');
            }
        }
    </script>
</body>
</html>
"""

@app.route("/")
def home():
    return render_template_string(HTML)

@app.route("/ask", methods=["POST"])
def ask():
    data = request.json
    question = data.get("question", "")
    if not question:
        return jsonify({"answer": "No question provided."})
    resposta = chat_engine.chat(question)
    return jsonify({"answer": str(resposta)})

if __name__ == "__main__":
    print("\n🚀 A iniciar servidor...")
    print("👉 Abre o browser em: http://localhost:5000\n")
    app.run(debug=False)