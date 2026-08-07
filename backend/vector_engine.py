import os
import re
import json
import sqlite3
import math
import uuid
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

class VectorEngine:
    """Per-database engine handling text extraction, chunking, vector indexing and similarity search."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path).resolve()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize SQLite database tables for documents and chunks with auto-migration support."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL,
                    uploaded_at TEXT NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    folder TEXT DEFAULT 'General'
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    parent_content TEXT,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)

            # Auto-migrate table if parent_content column does not exist yet
            cursor.execute("PRAGMA table_info(chunks)")
            columns = [info[1] for info in cursor.fetchall()]
            if "parent_content" not in columns:
                cursor.execute("ALTER TABLE chunks ADD COLUMN parent_content TEXT")

            conn.commit()

    def get_stats(self) -> Dict[str, Any]:
        """Return total document count, chunk count, and file size in bytes."""
        file_size = self.db_path.stat().st_size if self.db_path.exists() else 0
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM documents")
            doc_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM chunks")
            chunk_count = cursor.fetchone()[0]
        return {
            "document_count": doc_count,
            "chunk_count": chunk_count,
            "file_size_bytes": file_size
        }

    def _clean_text(self, text: str) -> str:
        """Clean and normalize raw extracted text before chunking."""
        if not text:
            return ""
        # Remove non-printable control characters except newlines and tabs
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)
        # Normalize multiple spaces or tabs into a single space
        text = re.sub(r"[ \t]+", " ", text)
        # Normalize excessive newlines (3 or more) to double newlines (paragraphs)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    # --- Document Text Extraction ---

    def extract_text(self, file_path: Path, filename: str) -> str:
        """Extract plain text from supported document types (PDF, TXT, DOCX, MD, CSV, JSON, HTML)."""
        ext = filename.split(".")[-1].lower() if "." in filename else ""

        if ext == "pdf":
            raw = self._extract_pdf(file_path)
        elif ext == "docx":
            raw = self._extract_docx(file_path)
        elif ext in ["html", "htm"]:
            raw = self._extract_html(file_path)
        elif ext == "json":
            raw = self._extract_json(file_path)
        elif ext == "csv":
            raw = self._extract_csv(file_path)
        else:
            raw = self._read_raw_text(file_path)

        return self._clean_text(raw)

    def _read_raw_text(self, file_path: Path) -> str:
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return file_path.read_text(encoding="latin1", errors="ignore")

    def _extract_pdf(self, file_path: Path) -> str:
        try:
            import fitz
            doc = fitz.open(str(file_path))
            text_pages = [page.get_text() for page in doc if page.get_text().strip()]
            doc.close()
            if text_pages:
                return "\n\n".join(text_pages)
        except Exception:
            pass

        try:
            import pypdf
            reader = pypdf.PdfReader(str(file_path))
            pages = [page.extract_text() for page in reader.pages if page.extract_text()]
            if pages:
                return "\n\n".join(pages)
        except Exception:
            pass

        return ""

    def _extract_docx(self, file_path: Path) -> str:
        try:
            import docx
            doc = docx.Document(str(file_path))
            return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        except Exception:
            return ""

    def _extract_html(self, file_path: Path) -> str:
        content = self._read_raw_text(file_path)
        clean = re.sub(r"<script.*?>.*?</script>", "", content, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r"<style.*?>.*?</style>", "", clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r"<[^>]+>", " ", clean)
        return re.sub(r"\s+", " ", clean).strip()

    def _extract_json(self, file_path: Path) -> str:
        content = self._read_raw_text(file_path)
        try:
            parsed = json.loads(content)
            return json.dumps(parsed, indent=2)
        except Exception:
            return content

    def _extract_csv(self, file_path: Path) -> str:
        content = self._read_raw_text(file_path)
        try:
            import csv
            lines = content.splitlines()
            reader = csv.reader(lines)
            rows = list(reader)
            if not rows:
                return content
            header = rows[0]
            formatted_rows = []
            for r_idx, row in enumerate(rows[1:], start=1):
                pairs = [f"{header[i]}: {row[i]}" for i in range(min(len(header), len(row))) if row[i].strip()]
                if pairs:
                    formatted_rows.append(f"Row {r_idx} -> " + "; ".join(pairs))
            if formatted_rows:
                return "\n".join(formatted_rows)
        except Exception:
            pass
        return content

    # --- Phase 1: Synthetic Question Generation (Ollama / llama.cpp / OpenAI) ---

    def generate_synthetic_questions(self, chunk_text: str) -> str:
        """Generate 2-3 synthetic questions using local LLM server (Ollama, llama.cpp, or OpenAI-compatible server)."""
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        default_model = os.getenv("OLLAMA_DEFAULT_MODEL", "llama.cpp")

        prompt = f"""Based on the following text excerpt, generate 2 or 3 short natural questions that can be directly answered by this text.
Return ONLY the questions, separated by newlines, with no extra text or numbering.

Excerpt:
{chunk_text[:1200]}"""

        import httpx

        # 1. Try Ollama native endpoint (/api/generate)
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    f"{ollama_url}/api/generate",
                    json={"model": default_model, "prompt": prompt, "stream": False}
                )
                if res.status_code == 200:
                    data = res.json()
                    questions = data.get("response", "").strip()
                    if questions:
                        return questions
        except Exception:
            pass

        # 2. Try OpenAI-compatible / llama.cpp endpoint (/v1/chat/completions)
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    f"{ollama_url}/v1/chat/completions",
                    json={
                        "model": default_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        questions = choices[0].get("message", {}).get("content", "").strip()
                        if questions:
                            return questions
        except Exception:
            pass

        # 3. Try llama.cpp native completion endpoint (/completion)
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    f"{ollama_url}/completion",
                    json={"prompt": prompt, "temperature": 0.3}
                )
                if res.status_code == 200:
                    data = res.json()
                    questions = data.get("content", "").strip()
                    if questions:
                        return questions
        except Exception as err:
            print(f"[Synthetic Q&A Error] Failed to reach LLM at {ollama_url}: {err}")

        return ""


    # --- Hierarchical Sentence-Window Chunking & Phase 2 Parent-Child ---

    def chunk_text(self, text: str, chunk_size: Optional[int] = None, overlap: Optional[int] = None) -> List[str]:
        """Split text into hierarchical, sentence-aware sliding window chunks using environment or provided settings."""
        if chunk_size is None:
            try:
                chunk_size = int(os.getenv("CHUNK_SIZE", "600"))
            except ValueError:
                chunk_size = 600

        if overlap is None:
            try:
                overlap = int(os.getenv("CHUNK_OVERLAP", "120"))
            except ValueError:
                overlap = 120

        text = text.strip()
        if not text:
            return []

        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        units = []
        for p in paragraphs:
            if len(p) <= chunk_size:
                units.append(p)
            else:
                sentences = re.split(r"(?<=[.!?])\s+|\n+", p)
                for s in sentences:
                    s_clean = s.strip()
                    if s_clean:
                        units.append(s_clean)

        chunks = []
        current_chunk = []
        current_len = 0

        for unit in units:
            unit_len = len(unit)
            if current_len + unit_len > chunk_size and current_chunk:
                chunk_str = "\n".join(current_chunk) if "\n" in "".join(current_chunk) else " ".join(current_chunk)
                chunks.append(chunk_str)

                overlap_chunk = []
                overlap_len = 0
                for u in reversed(current_chunk):
                    if overlap_len + len(u) <= overlap:
                        overlap_chunk.insert(0, u)
                        overlap_len += len(u)
                    else:
                        break
                current_chunk = overlap_chunk
                current_len = overlap_len

            current_chunk.append(unit)
            current_len += unit_len

        if current_chunk:
            chunk_str = "\n".join(current_chunk) if "\n" in "".join(current_chunk) else " ".join(current_chunk)
            chunks.append(chunk_str)

        return chunks

    def chunk_text_parent_child(self, text: str, parent_size: int = 1400, child_size: int = 400, child_overlap: int = 80) -> List[Dict[str, str]]:
        """Split text into large parent chunks (~1400 chars) and small child chunks (~400 chars) for hierarchical retrieval."""
        text = text.strip()
        if not text:
            return []

        parent_chunks = self.chunk_text(text, chunk_size=parent_size, overlap=200)
        items = []

        for parent in parent_chunks:
            children = self.chunk_text(parent, chunk_size=child_size, overlap=child_overlap)
            for child in children:
                items.append({
                    "child_text": child,
                    "parent_text": parent
                })

        return items

    # --- Vector Embedding & Cosine Similarity ---

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"\b\w{2,}\b", text.lower())

    def _compute_vector(self, text: str) -> Dict[str, float]:
        tokens = self._tokenize(text)
        if not tokens:
            return {}
        tf = {}
        for t in tokens:
            tf[t] = tf.get(t, 0.0) + 1.0
        total = math.sqrt(sum(v * v for v in tf.values()))
        return {k: v / total for k, v in tf.items()} if total > 0 else {}

    def _cosine_similarity(self, vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
        if not vec1 or not vec2:
            return 0.0
        intersection = set(vec1.keys()) & set(vec2.keys())
        dot = sum(vec1[k] * vec2[k] for k in intersection)
        return dot

    # --- Document & Ingestion Operations ---

    def ingest_document(
        self,
        file_path: Path,
        filename: str,
        folder: str = "General",
        enrich_qa: bool = False,
        parent_child: bool = False
    ) -> Dict[str, Any]:
        """Extract, clean, chunk (with optional Parent-Child and Synthetic Q&A), compute embeddings and persist document & chunks."""
        file_bytes = file_path.stat().st_size
        text_content = self.extract_text(file_path, filename)
        folder_clean = folder.strip() if folder and folder.strip() else "General"
        header_prefix = f"[Source: {filename} | Folder: {folder_clean}]\n"

        if parent_child:
            chunk_pairs = self.chunk_text_parent_child(text_content)
        else:
            raw_chunks = self.chunk_text(text_content)
            chunk_pairs = [{"child_text": c, "parent_text": ""} for c in raw_chunks]

        doc_id = str(uuid.uuid4())
        file_type = filename.split(".")[-1].lower() if "." in filename else "txt"
        uploaded_at = datetime.datetime.utcnow().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?)",
                (doc_id, filename, file_type, file_bytes, uploaded_at, len(chunk_pairs), folder_clean)
            )

            for idx, pair in enumerate(chunk_pairs):
                child_text = pair["child_text"]
                parent_text = pair["parent_text"]
                chunk_id = str(uuid.uuid4())

                # Phase 1: Synthetic Q&A Generation
                qa_block = ""
                if enrich_qa:
                    qa_text = self.generate_synthetic_questions(child_text)
                    if qa_text:
                        qa_block = f"[Synthetic Questions:\n{qa_text}]\n\n"

                chunk_content = f"{header_prefix}{qa_block}{child_text}"
                vector = self._compute_vector(chunk_content)
                vector_json = json.dumps(vector)

                cursor.execute(
                    "INSERT INTO chunks (id, document_id, filename, chunk_index, content, embedding, parent_content) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (chunk_id, doc_id, filename, idx, chunk_content, vector_json, parent_text)
                )

            conn.commit()

        return {
            "id": doc_id,
            "filename": filename,
            "file_type": file_type,
            "file_size_bytes": file_bytes,
            "uploaded_at": uploaded_at,
            "chunk_count": len(chunk_pairs),
            "folder": folder_clean,
            "enrich_qa": enrich_qa,
            "parent_child": parent_child,
        }

    def list_documents(self) -> List[Dict[str, Any]]:
        """List all documents in this database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, filename, file_type, file_size_bytes, uploaded_at, chunk_count, folder FROM documents ORDER BY uploaded_at DESC")
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "filename": r[1],
                    "file_type": r[2],
                    "file_size_bytes": r[3],
                    "uploaded_at": r[4],
                    "chunk_count": r[5],
                    "folder": r[6] or "General",
                }
                for r in rows
            ]

    def get_document_chunks(self, doc_id: str) -> List[Dict[str, Any]]:
        """Get all text chunks for a specific document ordered by chunk_index, including vector embeddings and parent context."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, document_id, filename, chunk_index, content, embedding, parent_content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC",
                (doc_id,)
            )
            rows = cursor.fetchall()
            return [
                {
                    "chunk_id": r[0],
                    "document_id": r[1],
                    "filename": r[2],
                    "chunk_index": r[3],
                    "content": r[4],
                    "embedding": json.loads(r[5]) if r[5] else {},
                    "parent_content": r[6] if len(r) > 6 and r[6] else ""
                }
                for r in rows
            ]

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document and its vector chunks."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
            cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            conn.commit()
            return cursor.rowcount > 0


    def search_chunks(self, query: str, top_k: int = 4, doc_ids: Optional[List[str]] = None, min_score: float = 0.0) -> List[Dict[str, Any]]:
        """Similarity search over chunks in this database."""
        query_vec = self._compute_vector(query)
        if not query_vec:
            return []

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            if doc_ids:
                placeholders = ",".join(["?"] * len(doc_ids))
                cursor.execute(
                    f"SELECT c.id, c.document_id, c.filename, c.chunk_index, c.content, c.embedding, d.folder, c.parent_content FROM chunks c JOIN documents d ON c.document_id = d.id WHERE c.document_id IN ({placeholders})",
                    doc_ids
                )
            else:
                cursor.execute("SELECT c.id, c.document_id, c.filename, c.chunk_index, c.content, c.embedding, d.folder, c.parent_content FROM chunks c JOIN documents d ON c.document_id = d.id")
            rows = cursor.fetchall()

        results = []
        for r in rows:
            chunk_id, doc_id, filename, chunk_idx, content, emb_json, doc_folder, parent_text = r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7] if len(r) > 7 else ""
            emb_vec = json.loads(emb_json)
            score = self._cosine_similarity(query_vec, emb_vec)
            if score >= min_score and score > 0.0:
                # If Parent-Child chunking was used, return full parent text for RAG synthesis context
                final_text = content
                if parent_text and parent_text.strip():
                    final_text = f"[Parent Context Window:\n{parent_text}]\n\n[Matched Chunk Excerpt:\n{content}]"

                results.append({
                    "chunk_id": chunk_id,
                    "document_id": doc_id,
                    "filename": filename,
                    "text": final_text,
                    "score": round(score, 4),
                    "chunk_index": chunk_idx,
                    "folder": doc_folder or "General",
                    "embedding": emb_vec,
                    "parent_content": parent_text or "",
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]


