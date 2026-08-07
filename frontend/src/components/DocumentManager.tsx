import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Folder, RefreshCw, Eye, Layers, X, Search, Sparkles, GitBranch, Info } from 'lucide-react';

import { DocumentItem } from '../types';
import * as api from '../api';

interface Props {
  dbId: string;
  documents: DocumentItem[];
  loading: boolean;
  onUpload: (files: File[], folder: string, enrichQa?: boolean, parentChild?: boolean) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
  onRefresh: () => void;
}

export const DocumentManager: React.FC<Props> = ({
  dbId,
  documents,
  loading,
  onUpload,
  onDelete,
  onRefresh,
}) => {
  const [folder, setFolder] = useState('General');
  const [enrichQa, setEnrichQa] = useState(false);
  const [parentChild, setParentChild] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chunk Inspector Modal State
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunkFilter, setChunkFilter] = useState('');
  const [showEmbeddings, setShowEmbeddings] = useState<Record<string, boolean>>({});
  const [enriching, setEnriching] = useState(false);

  const handleEnrichMissingQa = async (docId?: string) => {
    setEnriching(true);
    try {
      const res = await api.enrichMissingQa(dbId, docId);
      alert(res.message || 'Synthetic Q&A enrichment complete!');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to enrich missing Q&A');
    } finally {
      setEnriching(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await onUpload(Array.from(files), folder, enrichQa, parentChild);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInspectChunks = async (doc: DocumentItem) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    setChunkFilter('');
    try {
      const data = await api.fetchDocumentChunks(dbId, doc.id);
      setChunks(data);
    } catch (err) {
      console.error('Failed to load document chunks', err);
      setChunks([]);
    } finally {
      setLoadingChunks(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredChunks = chunks.filter((c) =>
    c.content.toLowerCase().includes(chunkFilter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      {/* Document Ingestion Hub */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        {/* Header & Category Selection */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UploadCloud size={20} style={{ color: 'var(--accent-cyan)' }} />
              Document Ingestion Hub
              <span className="score-badge" style={{ fontSize: '0.75rem', fontWeight: 600 }}>DB: {dbId}</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Extract, clean, chunk, and index documents into your isolated vector store.
            </p>
          </div>

          {/* Folder Tag Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Folder size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Category Tag:</span>
            <input
              type="text"
              className="input-field"
              style={{ width: '130px', marginTop: 0, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. Manuals"
            />
            {['General', 'Manuals', 'HR', 'Finance'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFolder(cat)}
                style={{
                  background: folder === cat ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  color: folder === cat ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline Feature Cards */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Info size={14} style={{ color: 'var(--accent-cyan)' }} />
            Advanced Ingestion Pipeline Enhancements (Optional)
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Card 1: Synthetic Q&A */}
            <div
              className={`pipeline-option-card ${enrichQa ? 'active' : ''}`}
              onClick={() => { if (!uploading) setEnrichQa(!enrichQa); }}
            >
              <input
                type="checkbox"
                disabled={uploading}
                checked={enrichQa}
                onChange={() => {}}
                style={{ marginTop: '0.2rem', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: enrichQa ? 'var(--accent-cyan)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Sparkles size={15} style={{ color: 'var(--accent-cyan)' }} /> Synthetic Q&A Expansion
                  </span>
                  <span className="file-tag-pill" style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent-cyan)' }}>
                    Ollama LLM
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Generates 2–3 questions per chunk using your LLM to match natural user queries.
                </p>
              </div>
            </div>

            {/* Card 2: Parent-Child Hierarchical */}
            <div
              className={`pipeline-option-card ${parentChild ? 'active' : ''}`}
              onClick={() => { if (!uploading) setParentChild(!parentChild); }}
            >
              <input
                type="checkbox"
                disabled={uploading}
                checked={parentChild}
                onChange={() => {}}
                style={{ marginTop: '0.2rem', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: parentChild ? 'var(--accent-cyan)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <GitBranch size={15} style={{ color: 'var(--accent-emerald)' }} /> Parent-Child Indexing
                  </span>
                  <span className="file-tag-pill" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)' }}>
                    Dual Tier
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Indexes small chunks (~400c) for search precision while supplying full parent context (~1400c) to RAG.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!uploading) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            disabled={uploading}
            style={{ display: 'none' }}
            accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploading ? (
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
              <RefreshCw size={32} className="spin" style={{ color: 'var(--accent-cyan)' }} />
              <div>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '0.2rem' }}>
                  Processing & Indexing Document(s) in Backend...
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {enrichQa
                    ? '🤖 Generating Synthetic Q&A pairs via LLM & building vector index...'
                    : parentChild
                    ? '🌳 Building Parent-Child context windows & computing vector embeddings...'
                    : '⚡ Extracting text, cleaning paragraphs, computing TF-IDF vectors & persisting chunks...'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <UploadCloud size={36} style={{ color: 'var(--accent-primary)' }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                Drag & drop files here, or <span style={{ color: 'var(--accent-cyan)', textDecoration: 'underline' }}>click to browse</span>
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.2rem' }}>
                {['PDF', 'DOCX', 'TXT', 'MD', 'CSV', 'JSON', 'HTML'].map((ext) => (
                  <span key={ext} className="file-tag-pill">{ext}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document List */}
      <div className="glass-panel" style={{ flex: 1, padding: '1.25rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Indexed Documents ({documents.length})</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.65rem' }}
              onClick={() => handleEnrichMissingQa()}
              disabled={uploading || enriching}
              title="Scan and generate synthetic Q&As for any chunks that missed LLM processing"
            >
              <Sparkles size={14} className={enriching ? 'spin' : ''} style={{ color: 'var(--accent-cyan)' }} />
              {enriching ? 'Enriching Q&As...' : 'Resume / Enrich Q&As'}
            </button>
            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} onClick={onRefresh} disabled={uploading || enriching}>
              <RefreshCw size={14} className={uploading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {uploading && (
          <div style={{
            background: 'rgba(6, 182, 212, 0.12)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            color: 'var(--accent-cyan)'
          }}>
            <RefreshCw size={18} className="spin" />
            <div>
              <strong>Ingestion Active:</strong> The backend is extracting text, creating chunks, computing embeddings, and saving to SQLite DB <code>{dbId}</code>.
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading documents...</div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p>No documents indexed in <strong>{dbId}</strong> yet.</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.65rem' }}>Document Name</th>
                  <th style={{ padding: '0.65rem' }}>Type</th>
                  <th style={{ padding: '0.65rem' }}>Size</th>
                  <th style={{ padding: '0.65rem' }}>Chunks</th>
                  <th style={{ padding: '0.65rem' }}>Folder</th>
                  <th style={{ padding: '0.65rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.65rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={16} style={{ color: 'var(--accent-cyan)' }} />
                      {doc.filename}
                    </td>
                    <td style={{ padding: '0.65rem', textTransform: 'uppercase', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {doc.file_type}
                    </td>
                    <td style={{ padding: '0.65rem', color: 'var(--text-muted)' }}>{formatBytes(doc.file_size_bytes)}</td>
                    <td style={{ padding: '0.65rem' }}>
                      <button
                        onClick={() => handleInspectChunks(doc)}
                        className="score-badge"
                        style={{
                          background: 'rgba(6, 182, 212, 0.15)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          transition: 'all 0.2s ease',
                        }}
                        title="Click to view all chunks of this document"
                      >
                        <Layers size={13} />
                        {doc.chunk_count} chunks
                      </button>
                    </td>
                    <td style={{ padding: '0.65rem', color: 'var(--text-muted)' }}>{doc.folder}</td>
                    <td style={{ padding: '0.65rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem' }}
                          onClick={() => handleInspectChunks(doc)}
                          title="Inspect Document Chunks"
                        >
                          <Eye size={14} /> View Chunks
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.25rem 0.5rem' }}
                          onClick={() => onDelete(doc.id)}
                          title="Delete Document"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunk Inspector Modal */}
      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div
            className="modal-card glass-panel"
            style={{ maxWidth: '720px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={18} style={{ color: 'var(--accent-cyan)' }} />
                  Document Vector Chunks
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  File: <strong style={{ color: 'white' }}>{selectedDoc.filename}</strong> ({selectedDoc.chunk_count} total chunks)
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Filter */}
            <div style={{ marginTop: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-field"
                style={{ marginTop: 0, padding: '0.4rem 0.75rem' }}
                placeholder="Filter chunks in this document..."
                value={chunkFilter}
                onChange={(e) => setChunkFilter(e.target.value)}
              />
            </div>

            {/* Chunks List Container */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
              {loadingChunks ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading chunks...</div>
              ) : filteredChunks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No matching chunks found.</div>
              ) : (
                filteredChunks.map((chunk) => {
                  const hasEmbedding = chunk.embedding && Object.keys(chunk.embedding).length > 0;
                  const isExpanded = showEmbeddings[chunk.chunk_id];
                  return (
                    <div
                      key={chunk.chunk_id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Chunk #{chunk.chunk_index + 1}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{chunk.content.length} chars</span>
                          {hasEmbedding && (
                            <button
                              onClick={() => setShowEmbeddings(prev => ({ ...prev, [chunk.chunk_id]: !prev[chunk.chunk_id] }))}
                              style={{
                                background: isExpanded ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                color: isExpanded ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                padding: '0.15rem 0.4rem',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                              }}
                            >
                              {isExpanded ? 'Hide Vector Embedding' : 'View Vector Embedding'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {chunk.content}
                      </div>

                      {chunk.parent_content && chunk.parent_content.strip !== '' && (
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '6px', borderLeft: '3px solid var(--accent-cyan)', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Parent Context Window:</span>
                          <span style={{ color: 'var(--text-muted)' }}>{chunk.parent_content}</span>
                        </div>
                      )}

                      {hasEmbedding && isExpanded && (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' }}>
                            Vector Embedding (TF-IDF Term Weights):
                          </div>
                          <pre style={{
                            background: '#0d1117',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            maxHeight: '140px',
                            overflowY: 'auto',
                            color: '#7ee787',
                            margin: 0,
                          }}>
                            {JSON.stringify(chunk.embedding, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


