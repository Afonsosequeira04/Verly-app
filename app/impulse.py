"""
impulse.py — Impulse Control Mode
Analisa uma compra antes de acontecer e devolve análise racional + alternativa + sugestão de espera.
Usa o LLM (Groq via LlamaIndex) que já existe no projeto.
"""
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user

impulse_bp = Blueprint('impulse', __name__)


# Prompts por personalidade — injetados no system prompt do LLM
SYSTEM_PROMPTS = {
    'savage': """És a Verly, uma assistente financeira BRUTAL e sem filtros.
Quando o utilizador quer comprar algo, dizes-lhe a verdade nua e crua.
Usa linguagem directa, às vezes agressiva mas sempre factual.
Nunca sejas gentil desnecessariamente. Sem rodeios.
Formato da resposta (em JSON):
{
  "analise": "análise racional mas cortante (2-3 frases)",
  "alternativa": "alternativa concreta ou sugestão de poupar (1-2 frases)",
  "aguardar": true ou false,
  "veredicto": "frase final de impacto (máx 15 palavras)"
}""",

    'sarcastic': """És a Verly, uma assistente financeira SARCÁSTICA e irónica.
Quando o utilizador quer comprar algo, respondes com ironia refinada mas construtiva.
Usa sarcasmo inteligente, não grosseria. Sê engraçado mas útil.
Formato da resposta (em JSON):
{
  "analise": "análise com tom sarcástico mas verdadeiro (2-3 frases)",
  "alternativa": "alternativa com ironia leve (1-2 frases)",
  "aguardar": true ou false,
  "veredicto": "frase sarcástica final (máx 15 palavras)"
}""",

    'calm': """És a Verly, uma coach financeira empática e construtiva.
Quando o utilizador quer comprar algo, ajudas-o a tomar uma decisão consciente.
Sê gentil, honesto e encorajador. Foca-te no bem-estar financeiro a longo prazo.
Formato da resposta (em JSON):
{
  "analise": "análise empática e construtiva (2-3 frases)",
  "alternativa": "sugestão alternativa gentil (1-2 frases)",
  "aguardar": true ou false,
  "veredicto": "mensagem encorajadora e honesta (máx 15 palavras)"
}""",

    'pro': """És a Verly, um CFO pessoal altamente analítico.
Quando o utilizador quer comprar algo, fazes uma análise custo-benefício objectiva.
Usa linguagem financeira, dados e lógica. Zero emoções, máximo rigor.
Formato da resposta (em JSON):
{
  "analise": "análise de custo-benefício e ROI (2-3 frases)",
  "alternativa": "alternativa baseada em dados ou redireccionamento de capital (1-2 frases)",
  "aguardar": true ou false,
  "veredicto": "recomendação final objectiva (máx 15 palavras)"
}""",
}


def _call_llm(system_prompt: str, user_message: str) -> dict:
    """
    Chama o LLM usando a mesma infra do projecto (Groq via LlamaIndex Settings).
    Devolve dict com analise, alternativa, aguardar, veredicto.
    """
    import json
    try:
        from llama_index.core import Settings
        from llama_index.llms.groq import Groq

        llm = Settings.llm

        full_prompt = f"{system_prompt}\n\nO utilizador quer comprar: {user_message}\n\nResponde APENAS com o JSON, sem markdown, sem texto extra."
        response = llm.complete(full_prompt)
        text = response.text.strip()

        # Limpar possíveis backticks do modelo
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
        text = text.strip().rstrip('`')

        parsed = json.loads(text)
        return {
            'analise':    parsed.get('analise', ''),
            'alternativa': parsed.get('alternativa', ''),
            'aguardar':   parsed.get('aguardar', True),
            'veredicto':  parsed.get('veredicto', ''),
            'error':      False,
        }

    except Exception as e:
        # Fallback se o LLM falhar
        return {
            'analise':    f'Antes de comprares, pensa: precisas mesmo disto agora?',
            'alternativa': 'Considera guardar o dinheiro por 48h e reavalia.',
            'aguardar':   True,
            'veredicto':  'Espera 48h. Se ainda quiseres, então compra.',
            'error':      True,
            'error_msg':  str(e),
        }


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@impulse_bp.route('/impulse')
@login_required
def impulse():
    personalidade = getattr(current_user, 'personalidade', 'calm') or 'calm'
    return render_template('impulse.html', personalidade_atual=personalidade)


@impulse_bp.route('/impulse/analyze', methods=['POST'])
@login_required
def analyze():
    """
    POST /impulse/analyze
    Body JSON: { produto: str, personalidade: str }
    Devolve análise racional + alternativa + veredicto.
    """
    data = request.json or {}
    produto      = (data.get('produto') or '').strip()
    personalidade = data.get('personalidade', 'calm')

    if not produto:
        return jsonify({'success': False, 'message': 'Descreve o que queres comprar.'})

    if personalidade not in SYSTEM_PROMPTS:
        personalidade = 'calm'

    system = SYSTEM_PROMPTS[personalidade]
    resultado = _call_llm(system, produto)

    return jsonify({
        'success':     True,
        'personalidade': personalidade,
        'produto':     produto,
        'resultado':   resultado,
    })
