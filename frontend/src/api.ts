import { VectorDatabase, DocumentItem, ChunkResult, QueryResponse, OllamaStatus } from './types';

const API_BASE = '/api';

export async function fetchOllamaStatus(): Promise<OllamaStatus> {
  const res = await fetch(`${API_BASE}/ollama/status`);
  if (!res.ok) throw new Error('Failed to fetch Ollama status');
  return res.json();
}


export async function fetchDatabases(): Promise<VectorDatabase[]> {
  const res = await fetch(`${API_BASE}/databases`);
  if (!res.ok) throw new Error('Failed to fetch vector databases');
  return res.json();
}

export async function createDatabase(id: string, name: string, description: string = ''): Promise<VectorDatabase> {
  const res = await fetch(`${API_BASE}/databases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, description }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to create database');
  }
  return res.json();
}

export async function deleteDatabase(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to delete database');
  }
}

export async function fetchDocuments(dbId: string): Promise<DocumentItem[]> {
  const res = await fetch(`${API_BASE}/databases/${dbId}/documents`);
  if (!res.ok) throw new Error(`Failed to fetch documents for database ${dbId}`);
  return res.json();
}

export async function uploadDocuments(
  dbId: string,
  files: File[],
  folder: string = 'General',
  enrichQa: boolean = false,
  parentChild: boolean = false
): Promise<any> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('folder', folder);
  formData.append('enrich_qa', String(enrichQa));
  formData.append('parent_child', String(parentChild));

  const res = await fetch(`${API_BASE}/databases/${dbId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to upload documents');
  }
  return res.json();
}

export async function fetchDocumentChunks(dbId: string, docId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/databases/${dbId}/documents/${docId}/chunks`);
  if (!res.ok) throw new Error('Failed to fetch document chunks');
  return res.json();
}

export async function enrichMissingQa(dbId: string, docId?: string): Promise<any> {
  const url = docId
    ? `${API_BASE}/databases/${dbId}/enrich-qa?doc_id=${docId}`
    : `${API_BASE}/databases/${dbId}/enrich-qa`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to enrich synthetic Q&A');
  }
  return res.json();
}

export async function fetchIngestionTasks(dbId?: string): Promise<any[]> {
  const url = dbId
    ? `${API_BASE}/ingestion/tasks?db_id=${dbId}`
    : `${API_BASE}/ingestion/tasks`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}


export async function deleteDocument(dbId: string, docId: string): Promise<void> {

  const res = await fetch(`${API_BASE}/databases/${dbId}/documents/${docId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to delete document');
  }
}

export async function searchVectorDb(
  dbId: string,
  query: string,
  topK: number = 5,
  minScore: number = 0.0
): Promise<ChunkResult[]> {
  const res = await fetch(`${API_BASE}/databases/${dbId}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK, min_score: minScore }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Search query failed');
  }
  return res.json();
}

export async function queryRagEngine(
  dbId: string,
  query: string,
  topK: number = 4,
  useOllama: boolean = true,
  model?: string,
  systemInstruction?: string,
  provider: string = 'local',
  apiKey?: string
): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/databases/${dbId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      top_k: topK,
      use_ollama: useOllama,
      provider,
      model,
      system_instruction: systemInstruction,
      api_key: apiKey,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'RAG query failed');
  }
  return res.json();
}

export async function queryRagEngineStream(

  dbId: string,
  query: string,
  topK: number = 4,
  useOllama: boolean = true,
  model?: string,
  systemInstruction?: string,
  provider: string = 'local',
  apiKey?: string,
  onMetadata?: (meta: { chunks: ChunkResult[]; modelUsed: string }) => void,
  onToken?: (token: string) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${dbId}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      top_k: topK,
      use_ollama: useOllama,
      provider,
      model,
      system_instruction: systemInstruction,
      api_key: apiKey,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Streaming query failed');
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const payload = JSON.parse(line);
        if (payload.type === 'metadata' && onMetadata) {
          onMetadata({
            chunks: payload.context_chunks || [],
            modelUsed: payload.model_used || provider,
          });
        } else if (payload.type === 'token' && onToken && payload.token !== undefined) {
          onToken(payload.token);
        }
      } catch (e) {
        // ignore incomplete line
      }
    }
  }

  if (buffer.trim()) {
    try {
      const payload = JSON.parse(buffer.trim());
      if (payload.type === 'metadata' && onMetadata) {
        onMetadata({
          chunks: payload.context_chunks || [],
          modelUsed: payload.model_used || provider,
        });
      } else if (payload.type === 'token' && onToken && payload.token !== undefined) {
        onToken(payload.token);
      }
    } catch (e) {}
  }
}




