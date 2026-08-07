import os
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Try loading .env variables from backend/ or project root
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass


from db_manager import DatabaseManager
from schemas import (
    DatabaseCreateRequest,
    DatabaseResponse,
    SearchRequest,
    ChunkResult,
    QueryRequest,
    QueryResponse,
    OllamaStatusResponse,
)

app = FastAPI(
    title="Vector DB Selective API",
    description="Multi-Database Isolated Vector Storage & RAG API with Ollama Support",
    version="1.1.0"
)

# Enable CORS for local development (frontend running on port 5173 or 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Database Manager instance
db_manager = DatabaseManager(data_dir="./data/databases")

# Ollama Server Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "vector-db-selective"}


@app.get("/api/ollama/status", response_model=OllamaStatusResponse)
async def check_ollama_status():
    """Check if local Ollama service is reachable and list installed models."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("models", [])
                models = [m.get("name") for m in raw_models if m.get("name")]
                default_m = models[0] if models else None
                return OllamaStatusResponse(
                    available=True,
                    url=OLLAMA_BASE_URL,
                    models=models,
                    default_model=default_m
                )
    except Exception:
        pass

    return OllamaStatusResponse(
        available=False,
        url=OLLAMA_BASE_URL,
        models=[],
        default_model=None
    )


# --- Database Management Endpoints ---

@app.get("/api/databases", response_model=List[DatabaseResponse])
def list_databases():
    """List all available isolated vector databases with statistics."""
    return db_manager.list_databases()


@app.post("/api/databases", response_model=DatabaseResponse, status_code=status.HTTP_201_CREATED)
def create_database(req: DatabaseCreateRequest):
    """Create a new vector database."""
    try:
        return db_manager.create_database(db_id=req.id, name=req.name, description=req.description)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/databases/{db_id}", response_model=DatabaseResponse)
def get_database(db_id: str):
    """Get metadata and statistics for a specific database."""
    info = db_manager.get_database(db_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found")
    return info


@app.delete("/api/databases/{db_id}")
def delete_database(db_id: str):
    """Delete an existing database and its physical SQLite file."""
    success = db_manager.delete_database(db_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found")
    return {"message": f"Database '{db_id}' deleted successfully", "id": db_id}


# --- Document Ingestion & Management Endpoints ---

@app.get("/api/databases/{db_id}/documents")
def list_documents(db_id: str):
    """List all documents stored in a specific vector database."""
    try:
        engine = db_manager.get_engine(db_id)
        return engine.list_documents()
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.post("/api/databases/{db_id}/upload")
async def upload_documents(
    db_id: str,
    files: List[UploadFile] = File(...),
    folder: Optional[str] = Form("General")
):
    """Upload one or more documents, extract text, chunk, and index into the specified vector database."""
    try:
        engine = db_manager.get_engine(db_id)
        results = []

        temp_dir = Path(tempfile.mkdtemp())
        try:
            for file in files:
                temp_filepath = temp_dir / file.filename
                with open(temp_filepath, "wb") as f:
                    content = await file.read()
                    f.write(content)

                doc_info = engine.ingest_document(temp_filepath, file.filename, folder=folder or "General")
                results.append(doc_info)

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

        return {
            "message": f"Successfully ingested {len(results)} file(s) into database '{db_id}'",
            "database_id": db_id,
            "documents": results
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.delete("/api/databases/{db_id}/documents/{doc_id}")
def delete_document(db_id: str, doc_id: str):
    """Delete a document and its chunks from a specific vector database."""
    try:
        engine = db_manager.get_engine(db_id)
        success = engine.delete_document(doc_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found in database '{db_id}'")
        return {"message": "Document deleted successfully", "doc_id": doc_id, "database_id": db_id}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


# --- Vector Search & RAG Query Endpoints ---

@app.post("/api/databases/{db_id}/search", response_model=List[ChunkResult])
def search_vector_db(db_id: str, req: SearchRequest):
    """Perform vector similarity search over the selected database."""
    try:
        engine = db_manager.get_engine(db_id)
        chunks = engine.search_chunks(
            query=req.query,
            top_k=req.top_k,
            doc_ids=req.doc_ids,
            min_score=req.min_score
        )
        return chunks
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.post("/api/databases/{db_id}/query", response_model=QueryResponse)
async def query_rag_engine(db_id: str, req: QueryRequest):
    """Perform RAG Q&A query over the specified vector database with Ollama LLM synthesis."""
    try:
        engine = db_manager.get_engine(db_id)
        chunks = engine.search_chunks(query=req.query, top_k=req.top_k)

        if not chunks:
            return QueryResponse(
                answer=f"No relevant content was found in database '{db_id}' to answer your query.",
                context_chunks=[],
                database_id=db_id,
                ollama_active=False
            )

        # Build context text from retrieved passages
        context_blocks = []
        for i, c in enumerate(chunks, 1):
            context_blocks.append(f"[Passage {i} - File: {c['filename']}]\n{c['text']}")
        context_str = "\n\n".join(context_blocks)

        # 1. Attempt generation via Ollama if requested
        if req.use_ollama:
            status_info = await check_ollama_status()
            if status_info.available:
                target_model = req.model or status_info.default_model or "llama3"

                system_prompt = (
                    req.system_instruction or 
                    "You are a helpful AI assistant. Answer the user's question accurately using ONLY the provided context passages. "
                    "If the context does not contain enough information, state that clearly."
                )

                prompt = (
                    f"Context Passages:\n{context_str}\n\n"
                    f"User Question: {req.query}\n\n"
                    f"Answer:"
                )

                payload = {
                    "model": target_model,
                    "prompt": prompt,
                    "system": system_prompt,
                    "stream": False
                }

                try:
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
                        if resp.status_code == 200:
                            data = resp.json()
                            llm_answer = data.get("response", "").strip()
                            if llm_answer:
                                return QueryResponse(
                                    answer=llm_answer,
                                    context_chunks=chunks,
                                    database_id=db_id,
                                    ollama_active=True,
                                    model_used=target_model
                                )
                except Exception as err:
                    # Logging Ollama connection error; falling back to excerpt summary
                    pass

        # 2. Fallback: Generate structured context excerpt summary
        fallback_note = ""
        if req.use_ollama:
            fallback_note = "*(Note: Ollama server not detected at http://localhost:11434. Displaying direct retrieved context excerpts below)*\n\n"

        answer = (
            fallback_note +
            f"Based on **{len(chunks)} relevant excerpt(s)** from database **{db_id}**:\n\n"
            + "\n\n".join([f"• **From `{c['filename']}`**: {c['text']}" for c in chunks])
        )

        return QueryResponse(
            answer=answer,
            context_chunks=chunks,
            database_id=db_id,
            ollama_active=False
        )

    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
