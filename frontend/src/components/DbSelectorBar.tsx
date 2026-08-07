import React from 'react';
import { Database, Plus, Trash2, HardDrive, Layers, FileText } from 'lucide-react';
import { VectorDatabase } from '../types';

interface Props {
  databases: VectorDatabase[];
  selectedDbId: string;
  onSelectDb: (id: string) => void;
  onOpenCreateModal: () => void;
  onDeleteDb: (id: string) => void;
}

export const DbSelectorBar: React.FC<Props> = ({
  databases,
  selectedDbId,
  onSelectDb,
  onOpenCreateModal,
  onDeleteDb,
}) => {
  const currentDb = databases.find((d) => d.id === selectedDbId);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <header className="header-bar glass-panel">
      <div className="brand">
        <div className="brand-icon">
          <Database size={22} />
        </div>
        <div>
          <h1 className="brand-title">Vector DB Selective</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Multi-Database RAG Manager</p>
        </div>
      </div>

      <div className="db-selector-group">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Active DB:</label>
          <select
            className="db-dropdown"
            value={selectedDbId}
            onChange={(e) => onSelectDb(e.target.value)}
          >
            {databases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name} ({db.id})
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={onOpenCreateModal}>
          <Plus size={16} /> New Database
        </button>

        {selectedDbId !== 'default' && (
          <button
            className="btn btn-danger"
            title="Delete active database"
            onClick={() => onDeleteDb(selectedDbId)}
          >
            <Trash2 size={16} /> Delete DB
          </button>
        )}
      </div>

      {currentDb && (
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <div className="stat-badge">
            <FileText size={14} /> Docs: <span className="stat-val">{currentDb.document_count}</span>
          </div>
          <div className="stat-badge">
            <Layers size={14} /> Chunks: <span className="stat-val">{currentDb.chunk_count}</span>
          </div>
          <div className="stat-badge">
            <HardDrive size={14} /> Size: <span className="stat-val">{formatBytes(currentDb.file_size_bytes)}</span>
          </div>
        </div>
      )}
    </header>
  );
};
