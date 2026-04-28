# Verly 💰

**The ultimate shopping guardian and warranty tracker.**

Verly is a SaaS application that helps users manage their finances, track product warranties, and never miss a return deadline. By leveraging RAG (Retrieval-Augmented Generation), the "Police" analyzes your receipts and invoices to give you organized data with a touch of sarcastic humor.

---

## 🚀 Features

- **Smart Invoice Upload**: Upload PDFs or images of your receipts directly to the platform.
- **AI-Powered Analysis**: Uses Llama 3 (via Groq) to extract store names, prices, dates, and items.
- **Warranty Tracking**: Automatically calculates warranty periods (standard 3 years in the EU) and return windows.
- **Financial "Roasting"**: A unique personality that gives you a hard time if you spend too much on useless stuff.
- **Privacy First**: Multi-user support with isolated data folders for each user.

---

## 🛠️ Tech Stack

- **Backend**: Python / Flask
- **AI Orchestration**: [LlamaIndex](https://www.llamaindex.ai/)
- **LLM**: Meta Llama 3.3 (via [Groq](https://groq.com/))
- **Embeddings**: HuggingFace (BGE Small)
- **OCR**: SimpleDirectoryReader (Image/PDF support)
- **Deployment**: Ready for Render/Railway

---

## 📋 Prerequisites

Before running the project, ensure you have:
- Python 3.10+
- A Groq API Key

---

## 🔧 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone [https://github.com/your-username/shopping-police.git](https://github.com/your-username/verly.git)
   cd shopping-police