Verly 💰
The ultimate shopping guardian and warranty tracker.

Verly is a SaaS application designed to help users manage their finances, track product warranties, and never miss a return deadline. By leveraging RAG (Retrieval-Augmented Generation), the "Police" analyzes your receipts and invoices to extract organized data, delivered with a touch of sarcastic humor (or professional insight—the choice is yours).

🚀 Features
Smart Invoice Upload: Upload PDFs or images of your receipts with automated extraction via OCR and AI.

AI-Powered Analysis: Uses Llama 3.3 (via Groq) to identify stores, prices, dates, items, and categories.

Personality System (Roasting): Choose between 4 profiles (Savage, Sarcastic, Calm, Pro) to receive feedback on your spending habits.

Impulse Control Module: Ask Verly before you buy. It performs a cost-benefit analysis and suggests whether you should pull the trigger or save your money.

Subscription Detector: Identifies financial "leaks" in recurring services (Netflix, Spotify, etc.) and warns you if you're paying for something you don't use.

Financial Damage Report: Detailed monthly reports featuring "estimated waste" calculations and spending trend analysis.

Warranty & Returns: Automatic calculation of warranty periods (EU standard 3 years) and return windows.

PDF Export: Generate professional reports of your expenses using ReportLab.

🛠️ Tech Stack
Backend & AI
Language: Python 3.10+

Web Framework: Flask (with Flask-Login & SQLAlchemy)

AI Orchestration: LlamaIndex

LLM: Meta Llama 3.3 via Groq

Embeddings: HuggingFace (BGE Small)

Database: SQLite (with automatic migration system for new schema fields)

Frontend
Engine: Jinja2 Templates

Design: Modern "Dark Mode" UI with pure CSS and dynamic variables.

Typography: Sora & Inter.

🔧 Installation & Setup
Clone the repository:

Bash
git clone https://github.com/your-username/verly.git
cd verly
Set up Environment:

Bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
Environment Variables:
Create a .env file in the root directory:

Code snippet
GROQ_API_KEY=your_api_key_here
FLASK_SECRET_KEY=your_secure_secret_key
Run the Application:

📋 Project Structure (Summary)
/app: Core logic (Blueprints for invoices, chat, scoring, subscriptions, etc.).

/templates: HTML interfaces organized by module (Jinja2).

/static: Assets, including custom CSS and inline SVG icons.

/user_data: Isolated storage for text data and vector indices per user (Privacy First).