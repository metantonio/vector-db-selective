export interface VectorDatabase {
  id: string;
  name: string;
  description: string;
  created_at: string;
  document_count: number;
  chunk_count: number;
  file_size_bytes: number;
}

export interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_at: string;
  chunk_count: number;
  folder: string;
}

export interface ChunkResult {
  chunk_id: string;
  document_id: string;
  filename: string;
  text: string;
  score: number;
  chunk_index: number;
  folder: string;
  embedding?: Record<string, number>;
}

export interface QueryResponse {
  answer: string;
  context_chunks: ChunkResult[];
  database_id: string;
  ollama_active?: boolean;
  model_used?: string;
}

export interface OllamaStatus {
  available: boolean;
  url: string;
  models: string[];
  default_model?: string;
}

