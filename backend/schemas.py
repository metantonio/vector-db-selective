from pydantic import BaseModel, Field
from typing import List, Optional, Any

class DatabaseCreateRequest(BaseModel):
    id: str = Field(..., description="Unique database identifier (alphanumeric, e.g. tech_docs)")
    name: str = Field(..., description="Human readable database title")
    description: Optional[str] = Field("", description="Optional database description")

class DatabaseResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    document_count: int
    chunk_count: int
    file_size_bytes: int

class SearchRequest(BaseModel):
    query: str = Field(..., description="Natural language search query")
    top_k: int = Field(5, ge=1, le=20, description="Maximum number of context passages to return")
    min_score: float = Field(0.0, ge=0.0, le=1.0, description="Minimum relevance score threshold")
    doc_ids: Optional[List[str]] = Field(None, description="Optional list of specific document IDs to filter by")

class ChunkResult(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    text: str
    score: float
    chunk_index: int
    folder: str

class QueryRequest(BaseModel):
    query: str = Field(..., description="User question or prompt for RAG synthesis")
    top_k: int = Field(4, ge=1, le=10)
    system_instruction: Optional[str] = Field(None, description="Optional custom system prompt for LLM")
    use_ollama: bool = Field(True, description="Whether to use LLM for response generation")
    provider: Optional[str] = Field("local", description="LLM provider: local, openai, claude, openrouter, gemini")
    model: Optional[str] = Field(None, description="Model ID")
    api_key: Optional[str] = Field(None, description="Optional API key override")


class QueryResponse(BaseModel):
    answer: str
    context_chunks: List[ChunkResult]
    database_id: str
    ollama_active: bool = False
    model_used: Optional[str] = None

class OllamaStatusResponse(BaseModel):
    available: bool
    url: str
    models: List[str]
    default_model: Optional[str] = None

