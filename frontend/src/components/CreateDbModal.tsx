import React, { useState } from 'react';
import { X, Database, Plus } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (id: string, name: string, description: string) => Promise<void>;
}

export const CreateDbModal: React.FC<Props> = ({ isOpen, onClose, onCreate }) => {
  const [dbId, setDbId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbId.trim() || !name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onCreate(dbId.trim(), name.trim(), description.trim());
      setDbId('');
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create database');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Create New Vector Database</h2>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.65rem', background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '6px', color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Database Identifier (ID):</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. tech_docs, financial_2026"
              value={dbId}
              onChange={(e) => setDbId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              required
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              Used for API calls & storage file: <code>{dbId || 'your_id'}.db</code>
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Display Name:</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Technical Documentation Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Description (Optional):</label>
            <textarea
              className="input-field"
              rows={3}
              placeholder="e.g. Architecture specs and API manuals"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={16} /> {loading ? 'Creating...' : 'Create Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
