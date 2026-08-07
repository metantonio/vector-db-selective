# Vector DB Selective 🚀

A lightweight, standalone, multi-database vector search & RAG application designed to create, manage, and query isolated vector databases.

---

## 🌟 Key Features

- **Isolated Multi-Database Management**: Create custom databases (e.g. `tech_docs`, `hr_policies`, `financial_2026`). Each database is stored as an independent, isolated SQLite vector store (`data/databases/<db_id>.db`).
- **Multi-Format Document Extraction**: Extracts and cleans content from PDF, DOCX, TXT, MD, CSV, JSON, and HTML files. Includes structured key-value formatting for tabular CSV data and text normalization.
- **Configurable & Hierarchical Chunking**: Fully configurable chunk length (`CHUNK_SIZE`) and overlap (`CHUNK_OVERLAP`) via `.env`. Implements paragraph-aware structural sliding-window chunking.
- **Synthetic Q&A Expansion (Ollama LLM)**: Optional ingestion pipeline feature that generates 2–3 synthetic question pairs per chunk using your local Ollama instance to bridge the user question-to-statement gap and boost similarity scores.
- **Parent-Child Hierarchical Indexing**: Dual-tier indexing pipeline that uses small child chunks (~400 chars) for precise vector matching while passing larger parent context windows (~1400 chars) to the RAG LLM for complete, un-truncated context synthesis.
- **Vector Embedding Inspector**: Inspect raw vector embedding term weights (`TF-IDF`) directly from the UI within the Chunk Inspector modal.
- **Vector Search & RAG Sandbox**: Test natural language vector searches with custom thresholds and interact with a contextual Q&A assistant against any selected database.
- **Modern Dark UI**: Glassmorphic UI with real-time stats, drag-and-drop document upload, and responsive tab layout.

---

## 🛠️ Architecture Overview

```
vector-db-selective/
├── backend/
│   ├── main.py              # FastAPI application server & REST endpoints
│   ├── db_manager.py        # Database lifecycle & master registry manager
│   ├── vector_engine.py     # Extraction, hierarchical chunker, Q&A synthesis & vector engine
│   ├── schemas.py           # Pydantic API schemas
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Backend environment settings template
├── frontend/
│   ├── src/
│   │   ├── components/      # DbSelectorBar, DocumentManager, VectorSearchSandbox, RagChatView, CreateDbModal
│   │   ├── App.tsx          # Main React Application
│   │   ├── api.ts           # REST API client
│   │   ├── index.css        # Glassmorphic Dark Design System
│   │   └── types.ts         # TypeScript definitions
│   ├── package.json
│   └── vite.config.ts
├── data/
│   └── databases/           # Storage folder for isolated SQLite vector DBs
├── .env                     # Project environment variables
├── .env.example             # Environment configuration example
└── start.bat                # One-click Windows launch script
```

---

## ⚙️ Environment Configuration (`.env`)

You can easily configure the chunking engine and Ollama connection parameters in your `.env` file:

```env
# --- Backend Server Settings ---
HOST=0.0.0.0
PORT=8000

# --- Vector Database Storage Settings ---
DATA_DIR=./data/databases

# --- Ollama Local LLM Engine Settings ---
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama.cpp


# --- Document Chunking Settings ---
# Target chunk size in characters for text extraction
CHUNK_SIZE=600

# Overlap size in characters between adjacent chunks
CHUNK_OVERLAP=120
```

---

## 🚀 Advanced Chunking Pipelines

### 1. 🤖 Synthetic Q&A Generation (Ollama)
When checked during upload, the backend passes each chunk to your local Ollama LLM to generate candidate questions:
```text
[Source: policy.pdf | Folder: HR]
[Synthetic Questions:
- What is the remote work policy?
- How many days can I work from home?]

Employees may work remotely up to 3 days per week...
```

### 2. 🌳 Parent-Child Hierarchical Indexing
When checked during upload, text is indexed hierarchically:
- **Child Chunk**: ~400 characters (Vector Similarity Search)
- **Parent Context Window**: ~1400 characters (Passed to RAG LLM for synthesis)

---

## 🚀 Quick Start Instructions

### 1. Install Dependencies

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Run the Application

**Option A: Using double-click launcher (Windows)**
Run `start.bat`.

**Option B: Manual start**

1. Terminal 1 (Backend):
```bash
cd backend
python main.py
```
Backend runs at: `http://localhost:8000` (API Docs at `http://localhost:8000/docs`).

2. Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```
Frontend runs at: `http://localhost:5173`.

---

## 🛰️ REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/databases` | List all vector databases and stats |
| `POST` | `/api/databases` | Create a new vector database |
| `DELETE` | `/api/databases/{db_id}` | Delete database and its physical file |
| `GET` | `/api/databases/{db_id}/documents` | List documents in a database |
| `POST` | `/api/databases/{db_id}/upload` | Upload & index documents into database (supports `folder`, `enrich_qa`, `parent_child`) |
| `GET` | `/api/databases/{db_id}/documents/{doc_id}/chunks` | Retrieve chunks and vector embeddings for a document |
| `DELETE` | `/api/databases/{db_id}/documents/{doc_id}` | Delete document from database |
| `POST` | `/api/databases/{db_id}/search` | Vector similarity search in database |
| `POST` | `/api/databases/{db_id}/query` | RAG contextual Q&A query in database |
