import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Folder, CheckCircle, RefreshCw } from 'lucide-react';
import { DocumentItem } from '../types';

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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
                      <span className="score-badge">{doc.chunk_count} chunks</span>
                    </td>
                    <td style={{ padding: '0.65rem', color: 'var(--text-muted)' }}>{doc.folder}</td>
                    <td style={{ padding: '0.65rem', textAlign: 'right' }}>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.25rem 0.5rem' }}
                        onClick={() => onDelete(doc.id)}
                        title="Delete Document"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
