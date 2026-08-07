# Vector DB Selective 🚀

A lightweight, standalone, multi-database vector search & RAG application designed to create, manage, and query isolated vector databases.

---

## 🌟 Key Features

- **Isolated Multi-Database Management**: Create custom databases (e.g. `tech_docs`, `hr_policies`, `financial_2026`). Each database is stored as an independent, isolated SQLite vector store (`data/databases/<db_id>.db`).
- **Multi-Format Document Extraction**: Extracts and chunks content from PDF, DOCX, TXT, MD, CSV, JSON, and HTML files.
- **Sentence-Window Vector Indexing**: Intelligent sentence-boundary chunking with cosine similarity vector scoring.
- **Vector Search & RAG Sandbox**: Test natural language vector searches with custom thresholds and interact with a contextual Q&A assistant against any selected database.
- **Modern Dark UI**: Glassmorphic UI with real-time stats, drag-and-drop document upload, and responsive tab layout.

---

## 🛠️ Architecture Overview

```
C:\Repositorios\vector-db-selective/
├── backend/
│   ├── main.py              # FastAPI application server & REST endpoints
│   ├── db_manager.py        # Database lifecycle & master registry manager
│   ├── vector_engine.py     # Document text extractor, chunker & similarity engine
│   ├── schemas.py           # Pydantic API schemas
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/      # DbSelectorBar, DocumentManager, VectorSearch, RagChatView, CreateDbModal
│   │   ├── App.tsx          # Main React Application
│   │   ├── api.ts           # REST API client
│   │   ├── index.css        # Glassmorphic Dark Design System
│   │   └── types.ts         # TypeScript definitions
│   ├── package.json
│   └── vite.config.ts
├── data/
│   └── databases/           # Storage folder for isolated SQLite vector DBs
└── start.bat                # One-click Windows launch script
```

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
| `POST` | `/api/databases/{db_id}/upload` | Upload & index documents into database |
| `DELETE` | `/api/databases/{db_id}/documents/{doc_id}` | Delete document from database |
| `POST` | `/api/databases/{db_id}/search` | Vector similarity search in database |
| `POST` | `/api/databases/{db_id}/query` | RAG contextual Q&A query in database |
