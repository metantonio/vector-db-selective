import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Folder, RefreshCw, Eye, Layers, X, Search } from 'lucide-react';
import { DocumentItem } from '../types';
import * as api from '../api';

interface Props {
  dbId: string;
  documents: DocumentItem[];
  loading: boolean;
  onUpload: (files: File[], folder: string) => Promise<void>;
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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chunk Inspector Modal State
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunkFilter, setChunkFilter] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await onUpload(Array.from(files), folder);
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
      {/* Upload Zone */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Ingest Documents into DB: <span style={{ color: 'var(--accent-cyan)' }}>{dbId}</span></h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supported: PDF, DOCX, TXT, MD, CSV, JSON, HTML</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              style={{ width: '140px', marginTop: 0, padding: '0.35rem 0.6rem' }}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder tag"
            />
          </div>
        </div>

        <div
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            style={{ display: 'none' }}
            accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <UploadCloud size={32} style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {uploading ? 'Processing & Indexing Vector Chunks...' : 'Drag & drop files here, or click to browse'}
          </p>
        </div>
      </div>

      {/* Document List */}
      <div className="glass-panel" style={{ flex: 1, padding: '1.25rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Indexed Documents ({documents.length})</h3>
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

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
                filteredChunks.map((chunk) => (
                  <div
                    key={chunk.chunk_id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Chunk #{chunk.chunk_index + 1}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{chunk.content.length} chars</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {chunk.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

