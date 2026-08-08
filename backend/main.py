import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional, Dict, Any

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
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

# Global Database Manager instance (resolves canonically to project root data/databases)
db_manager = DatabaseManager()


# Ollama Server Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "vector-db-selective"}


@app.get("/api/ollama/status", response_model=OllamaStatusResponse)
async def check_ollama_status():
    """Check if local LLM service (Ollama, llama.cpp, OpenAI-compatible) is reachable and list models."""
    default_env_model = os.getenv("OLLAMA_DEFAULT_MODEL", "llama.cpp")

    # 1. Check Ollama native /api/tags
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("models", [])
                models = [m.get("name") for m in raw_models if m.get("name")]
                default_m = models[0] if models else default_env_model
                return OllamaStatusResponse(
                    available=True,
                    url=OLLAMA_BASE_URL,
                    models=models or [default_env_model],
                    default_model=default_m
                )
    except Exception:
        pass

    # 2. Check OpenAI / llama.cpp /v1/models
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("data", [])
                models = [m.get("id") for m in raw_models if m.get("id")]
                default_m = models[0] if models else default_env_model
                return OllamaStatusResponse(
                    available=True,
                    url=OLLAMA_BASE_URL,
                    models=models or [default_m],
                    default_model=default_m
                )
    except Exception:
        pass

    # 3. Check llama.cpp native /health
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/health")
            if resp.status_code == 200:
                return OllamaStatusResponse(
                    available=True,
                    url=OLLAMA_BASE_URL,
                    models=[default_env_model],
                    default_model=default_env_model
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


# Active Ingestion Progress Tracker
active_ingestion_tasks: Dict[str, Dict[str, Any]] = {}


@app.get("/api/ingestion/tasks")
def list_ingestion_tasks(db_id: Optional[str] = None):
    """Return active or recent ingestion tasks with progress percentage, speed, and estimated time remaining (ETA)."""
    tasks = list(active_ingestion_tasks.values())
    if db_id:
        return [t for t in tasks if t.get("db_id") == db_id]
    return tasks


@app.post("/api/databases/{db_id}/upload")
async def upload_documents(
    db_id: str,
    files: List[UploadFile] = File(...),
    folder: Optional[str] = Form("General"),
    enrich_qa: Optional[bool] = Form(False),
    parent_child: Optional[bool] = Form(False)
):
    """Upload one or more documents, extract text, chunk (with optional Synthetic Q&A and Parent-Child Indexing), and index into vector DB."""
    try:
        engine = db_manager.get_engine(db_id)
        results = []

        temp_dir = Path(tempfile.mkdtemp())
        try:
            for file in files:
                task_id = f"upload_{uuid.uuid4().hex[:8]}"
                active_ingestion_tasks[task_id] = {
                    "task_id": task_id,
                    "db_id": db_id,
                    "filename": file.filename,
                    "status": "processing",
                    "completed_chunks": 0,
                    "total_chunks": 0,
                    "percentage": 0.0,
                    "elapsed_seconds": 0.0,
                    "avg_speed_sec": 0.0,
                    "eta_seconds": 0.0,
                    "status_message": f"Starting ingestion for {file.filename}..."
                }

                def make_callback(t_id):
                    def cb(data):
                        if t_id in active_ingestion_tasks:
                            active_ingestion_tasks[t_id].update({
                                "completed_chunks": data["completed_chunks"],
                                "total_chunks": data["total_chunks"],
                                "percentage": data["percentage"],
                                "elapsed_seconds": data["elapsed_seconds"],
                                "avg_speed_sec": data["avg_speed_sec"],
                                "eta_seconds": data["eta_seconds"],
                                "status_message": data["status_message"],
                            })
                    return cb

                temp_filepath = temp_dir / file.filename
                with open(temp_filepath, "wb") as f:
                    content = await file.read()
                    f.write(content)

                doc_info = engine.ingest_document(
                    temp_filepath,
                    file.filename,
                    folder=folder or "General",
                    enrich_qa=bool(enrich_qa),
                    parent_child=bool(parent_child),
                    progress_callback=make_callback(task_id)
                )

                active_ingestion_tasks[task_id]["status"] = "completed"
                active_ingestion_tasks[task_id]["percentage"] = 100.0
                active_ingestion_tasks[task_id]["status_message"] = f"Ingestion complete for {file.filename}"
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


@app.get("/api/databases/{db_id}/documents/{doc_id}/chunks")
def get_document_chunks(db_id: str, doc_id: str):
    """Retrieve all chunks belonging to a specific document."""
    try:
        engine = db_manager.get_engine(db_id)
        return engine.get_document_chunks(doc_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.post("/api/databases/{db_id}/enrich-qa")
def enrich_missing_qa(db_id: str, doc_id: Optional[str] = None):
    """Enrich or resume generating synthetic Q&A for chunks that missed questions."""
    try:
        engine = db_manager.get_engine(db_id)
        task_id = f"enrich_{uuid.uuid4().hex[:8]}"
        active_ingestion_tasks[task_id] = {
            "task_id": task_id,
            "db_id": db_id,
            "filename": "Synthetic Q&A Batch",
            "status": "processing",
            "completed_chunks": 0,
            "total_chunks": 0,
            "percentage": 0.0,
            "elapsed_seconds": 0.0,
            "avg_speed_sec": 0.0,
            "eta_seconds": 0.0,
            "status_message": "Scanning chunks for synthetic Q&A enrichment..."
        }

        def callback(data):
            if task_id in active_ingestion_tasks:
                active_ingestion_tasks[task_id].update({
                    "completed_chunks": data["completed_chunks"],
                    "total_chunks": data["total_chunks"],
                    "percentage": data["percentage"],
                    "elapsed_seconds": data["elapsed_seconds"],
                    "avg_speed_sec": data["avg_speed_sec"],
                    "eta_seconds": data["eta_seconds"],
                    "status_message": data["status_message"],
                })

        count = engine.enrich_missing_questions(doc_id=doc_id, progress_callback=callback)
        active_ingestion_tasks[task_id]["status"] = "completed"
        active_ingestion_tasks[task_id]["percentage"] = 100.0
        active_ingestion_tasks[task_id]["status_message"] = f"Enriched {count} chunk(s) with Synthetic Q&A"

        return {
            "message": f"Successfully enriched {count} chunk(s) with Synthetic Q&A in database '{db_id}'",
            "database_id": db_id,
            "enriched_chunks": count
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.get("/api/databases/{db_id}/export/jsonl")
def export_database_jsonl(
    db_id: str,
    format: Optional[str] = "messages",
    synthetic_only: Optional[bool] = False,
    doc_ids: Optional[str] = None,
    system_prompt: Optional[str] = None,
    refine_answers: Optional[bool] = False
):
    """Export database documents/chunks into JSONL format for fine-tuning LLMs."""
    try:
        engine = db_manager.get_engine(db_id)
        doc_id_list = [d.strip() for d in doc_ids.split(",") if d.strip()] if doc_ids else None
        
        jsonl_data = engine.export_jsonl(
            format=format or "messages",
            synthetic_only=bool(synthetic_only),
            doc_ids=doc_id_list,
            system_prompt=system_prompt,
            refine_answers=bool(refine_answers)
        )


        filename = f"{db_id}_finetune_{format or 'messages'}.jsonl"
        return Response(
            content=jsonl_data,
            media_type="application/x-ndjson",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\""
            }
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/refine-jsonl")
async def refine_existing_jsonl(file: UploadFile = File(...)):
    """Upload an existing JSONL file and refine all question-answer pairs using the local LLM."""
    try:
        content_bytes = await file.read()
        text = content_bytes.decode("utf-8", errors="ignore")
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        engine = db_manager.get_engine("default")
        refined_lines = []

        for line in lines:
            try:
                data = json.loads(line)
            except Exception:
                refined_lines.append(line)
                continue

            # Infer filename source
            filename = file.filename.replace(".jsonl", ".txt")

            # 1. Chat / Messages format
            if "messages" in data and isinstance(data["messages"], list):
                user_msg = next((m for m in data["messages"] if m.get("role") == "user"), None)
                assistant_msg = next((m for m in data["messages"] if m.get("role") == "assistant"), None)
                if user_msg and assistant_msg:
                    q = user_msg.get("content", "")
                    raw_a = assistant_msg.get("content", "")
                    
                    # Try extracting source from raw answer if present
                    src_match = re.search(r"\[Source:\s*(.*?)(?:\s*\||\])", raw_a)
                    if src_match:
                        filename = src_match.group(1).strip()

                    refined_a = engine.refine_answer(q, raw_a, filename)
                    assistant_msg["content"] = refined_a
                refined_lines.append(json.dumps(data, ensure_ascii=False))

            # 2. Alpaca format
            elif "instruction" in data and "output" in data:
                q = data.get("instruction", "")
                raw_a = data.get("output", "")
                inp = data.get("input", "")
                src_match = re.search(r"Source:\s*([^\s()]+)", inp)
                if src_match:
                    filename = src_match.group(1).strip()

                refined_a = engine.refine_answer(q, raw_a, filename)
                data["output"] = refined_a
                refined_lines.append(json.dumps(data, ensure_ascii=False))

            # 3. Prompt / Completion format
            elif "prompt" in data and "completion" in data:
                q = data.get("prompt", "")
                raw_a = data.get("completion", "")
                refined_a = engine.refine_answer(q, raw_a, filename)
                data["completion"] = f" {refined_a}"
                refined_lines.append(json.dumps(data, ensure_ascii=False))

            else:
                refined_lines.append(line)

        output_content = "\n".join(refined_lines)
        base_name = file.filename if file.filename.endswith(".jsonl") else f"{file.filename}.jsonl"
        out_filename = base_name.replace(".jsonl", "_refined.jsonl")

        return Response(
            content=output_content,
            media_type="application/x-ndjson",
            headers={
                "Content-Disposition": f"attachment; filename=\"{out_filename}\""
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refine JSONL file: {str(e)}")






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


async def query_llm_provider(
    provider: str,
    model: Optional[str],
    system_prompt: str,
    prompt: str,
    custom_api_key: Optional[str] = None
) -> Tuple[str, str]:
    """Route chat query to selected LLM provider (local, openai, claude, openrouter, gemini)."""
    p = (provider or "local").lower().strip()

    if p in ["local", "ollama", "llamacpp"]:
        status_info = await check_ollama_status()
        target_model = model or status_info.default_model or "llama.cpp"

        # 1. Try Ollama native /api/generate
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model": target_model, "prompt": prompt, "system": system_prompt, "stream": False}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    ans = data.get("response", "").strip()
                    if ans:
                        return ans, f"Local ({target_model})"
        except Exception:
            pass

        # 2. Try OpenAI-compatible /v1/chat/completions
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/v1/chat/completions",
                    json={
                        "model": target_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        "stream": False
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        ans = choices[0].get("message", {}).get("content", "").strip()
                        if ans:
                            return ans, f"Local ({target_model})"
        except Exception:
            pass

        # 3. Try llama.cpp native /completion
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/completion",
                    json={"prompt": f"{system_prompt}\n\n{prompt}", "temperature": 0.3}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    ans = data.get("content", "").strip()
                    if ans:
                        return ans, f"Local ({target_model})"
        except Exception:
            pass

        raise ValueError(f"Could not connect to local LLM server at {OLLAMA_BASE_URL}")

    elif p == "openai":
        api_key = custom_api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set. Please add it to your .env file or enter your API key in the UI.")
        target_model = model or "gpt-4o-mini"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": target_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                ans = data["choices"][0]["message"]["content"].strip()
                return ans, f"OpenAI ({target_model})"
            else:
                raise ValueError(f"OpenAI API Error ({resp.status_code}): {resp.text}")

    elif p in ["claude", "anthropic"]:
        api_key = custom_api_key or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set. Please add it to your .env file or enter your API key in the UI.")
        target_model = model or "claude-3-5-sonnet-20241022"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": target_model,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1024
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                ans = data["content"][0]["text"].strip()
                return ans, f"Claude ({target_model})"
            else:
                raise ValueError(f"Anthropic Claude API Error ({resp.status_code}): {resp.text}")

    elif p == "openrouter":
        api_key = custom_api_key or os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is not set. Please add it to your .env file or enter your API key in the UI.")
        target_model = model or "anthropic/claude-3.5-sonnet"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Vector DB Selective",
                    "Content-Type": "application/json"
                },
                json={
                    "model": target_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                ans = data["choices"][0]["message"]["content"].strip()
                return ans, f"OpenRouter ({target_model})"
            else:
                raise ValueError(f"OpenRouter API Error ({resp.status_code}): {resp.text}")

    elif p == "gemini":
        api_key = custom_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY / GOOGLE_API_KEY is not set. Please add it to your .env file or enter your API key in the UI.")
        target_model = model or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
        full_prompt = f"{system_prompt}\n\n{prompt}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": full_prompt}]}]}
            )
            if resp.status_code == 200:
                data = resp.json()
                ans = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                return ans, f"Gemini ({target_model})"
            else:
                raise ValueError(f"Google Gemini API Error ({resp.status_code}): {resp.text}")

    else:
        raise ValueError(f"Unsupported LLM provider '{provider}'")


@app.post("/api/databases/{db_id}/query", response_model=QueryResponse)
async def query_rag_engine(db_id: str, req: QueryRequest):
    """Perform RAG Q&A query over the specified vector database with multi-provider LLM synthesis."""
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

        # 1. Attempt generation via requested LLM provider (local, openai, claude, openrouter, gemini)
        if req.use_ollama:
            try:
                llm_answer, model_label = await query_llm_provider(
                    provider=req.provider or "local",
                    model=req.model,
                    system_prompt=system_prompt,
                    prompt=prompt,
                    custom_api_key=req.api_key
                )
                return QueryResponse(
                    answer=llm_answer,
                    context_chunks=chunks,
                    database_id=db_id,
                    ollama_active=True,
                    model_used=model_label
                )
            except Exception as err:
                print(f"[LLM Query Warning] {err}")

        # 2. Fallback: Generate structured context excerpt summary
        answer = (
            "*(Note: Could not reach selected LLM provider. Displaying direct retrieved context excerpts below)*\n\n" +
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


async def stream_llm_provider(
    provider: str,
    model: Optional[str],
    system_prompt: str,
    prompt: str,
    custom_api_key: Optional[str] = None
):
    """Async generator yielding token strings from the selected provider."""
    p = (provider or "local").lower().strip()

    if p in ["local", "ollama", "llamacpp"]:
        status_info = await check_ollama_status()
        target_model = model or status_info.default_model or "llama.cpp"
        tokens_yielded = False

        # 1. Try Ollama native /api/generate (streaming)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model": target_model, "prompt": prompt, "system": system_prompt, "stream": True}
                ) as resp:
                    if resp.status_code == 200:
                        async for line in resp.aiter_lines():
                            if line.strip():
                                try:
                                    data = json.loads(line)
                                    tok = data.get("response", "")
                                    if tok:
                                        tokens_yielded = True
                                        yield tok
                                except Exception:
                                    pass
                        if tokens_yielded:
                            return
        except Exception:
            pass

        # 2. Try /v1/chat/completions (streaming)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/v1/chat/completions",
                    json={
                        "model": target_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        "stream": True
                    }
                ) as resp:
                    if resp.status_code == 200:
                        async for line in resp.aiter_lines():
                            line_str = line.strip()
                            if line_str.startswith("data: "):
                                payload = line_str[6:].strip()
                                if payload == "[DONE]":
                                    break
                                try:
                                    data = json.loads(payload)
                                    tok = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if tok:
                                        tokens_yielded = True
                                        yield tok
                                except Exception:
                                    pass
                        if tokens_yielded:
                            return
        except Exception:
            pass

        # 3. Try /completion (streaming)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/completion",
                    json={"prompt": f"{system_prompt}\n\n{prompt}", "stream": True, "temperature": 0.3}
                ) as resp:
                    if resp.status_code == 200:
                        async for line in resp.aiter_lines():
                            line_str = line.strip()
                            if line_str.startswith("data: "):
                                payload = line_str[6:].strip()
                                try:
                                    data = json.loads(payload)
                                    tok = data.get("content", "")
                                    if tok:
                                        tokens_yielded = True
                                        yield tok
                                except Exception:
                                    pass
                        if tokens_yielded:
                            return
        except Exception:
            pass

        raise ValueError(f"Could not connect to local LLM server at {OLLAMA_BASE_URL}")

    elif p == "openai":
        api_key = custom_api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set.")
        target_model = model or "gpt-4o-mini"
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": target_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "stream": True
                }
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    raise ValueError(f"OpenAI Error ({resp.status_code}): {err_body.decode()}")
                async for line in resp.aiter_lines():
                    line_str = line.strip()
                    if line_str.startswith("data: "):
                        payload = line_str[6:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            data = json.loads(payload)
                            tok = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if tok:
                                yield tok
                        except Exception:
                            pass

    elif p in ["claude", "anthropic"]:
        api_key = custom_api_key or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set.")
        target_model = model or "claude-3-5-sonnet-20241022"
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": target_model,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1024,
                    "stream": True
                }
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    raise ValueError(f"Claude Error ({resp.status_code}): {err_body.decode()}")
                async for line in resp.aiter_lines():
                    line_str = line.strip()
                    if line_str.startswith("data: "):
                        payload = line_str[6:].strip()
                        try:
                            data = json.loads(payload)
                            if data.get("type") == "content_block_delta":
                                tok = data.get("delta", {}).get("text", "")
                                if tok:
                                    yield tok
                        except Exception:
                            pass

    elif p == "openrouter":
        api_key = custom_api_key or os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is not set.")
        target_model = model or "anthropic/claude-3.5-sonnet"
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Vector DB Selective",
                    "Content-Type": "application/json"
                },
                json={
                    "model": target_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "stream": True
                }
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    raise ValueError(f"OpenRouter Error ({resp.status_code}): {err_body.decode()}")
                async for line in resp.aiter_lines():
                    line_str = line.strip()
                    if line_str.startswith("data: "):
                        payload = line_str[6:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            data = json.loads(payload)
                            tok = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if tok:
                                yield tok
                        except Exception:
                            pass

    elif p == "gemini":
        api_key = custom_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set.")
        target_model = model or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:streamGenerateContent?key={api_key}&alt=sse"
        full_prompt = f"{system_prompt}\n\n{prompt}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": full_prompt}]}]}
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    raise ValueError(f"Gemini Error ({resp.status_code}): {err_body.decode()}")
                async for line in resp.aiter_lines():
                    line_str = line.strip()
                    if line_str.startswith("data: "):
                        payload = line_str[6:].strip()
                        try:
                            data = json.loads(payload)
                            candidates = data.get("candidates", [{}])
                            parts = candidates[0].get("content", {}).get("parts", [{}])
                            tok = parts[0].get("text", "")
                            if tok:
                                yield tok
                        except Exception:
                            pass


@app.post("/api/databases/{db_id}/query/stream")
async def query_rag_engine_stream(db_id: str, req: QueryRequest):
    """Perform RAG Q&A query over vector database with NDJSON streaming token synthesis."""
    try:
        engine = db_manager.get_engine(db_id)
        chunks = engine.search_chunks(query=req.query, top_k=req.top_k)

        context_blocks = []
        for i, c in enumerate(chunks, 1):
            context_blocks.append(f"[Passage {i} - File: {c['filename']}]\n{c['text']}")
        context_str = "\n\n".join(context_blocks)

        system_prompt = (
            req.system_instruction or
            "You are a helpful AI assistant. Answer the user's question accurately using ONLY the provided context passages. "
            "If the context does not contain enough information, state that clearly."
        )
        prompt = f"Context Passages:\n{context_str}\n\nUser Question: {req.query}\n\nAnswer:"
        model_label = f"{(req.provider or 'local').upper()} ({req.model or 'default'})"

        async def event_generator():
            # Send initial metadata object as NDJSON line
            meta = {
                "type": "metadata",
                "context_chunks": chunks,
                "database_id": db_id,
                "model_used": model_label,
                "ollama_active": True
            }
            yield json.dumps(meta) + "\n"

            if not chunks:
                msg = f"No relevant content was found in database '{db_id}' to answer your query."
                yield json.dumps({"type": "token", "token": msg}) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
                return

            try:
                async for token in stream_llm_provider(
                    provider=req.provider or "local",
                    model=req.model,
                    system_prompt=system_prompt,
                    prompt=prompt,
                    custom_api_key=req.api_key
                ):
                    yield json.dumps({"type": "token", "token": token}) + "\n"
            except Exception as err:
                print(f"[Streaming Fallback Error] {err}")
                fallback_note = f"*(Note: Streaming error with {model_label}: {str(err)}. Displaying direct retrieved context excerpts below)*\n\n"
                yield json.dumps({"type": "token", "token": fallback_note}) + "\n"
                for c in chunks:
                    chunk_text = f"• **From `{c['filename']}`**: {c['text']}\n\n"
                    yield json.dumps({"type": "token", "token": chunk_text}) + "\n"

            yield json.dumps({"type": "done"}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

