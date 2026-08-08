import React, { useState } from 'react';
import { X, Download, FileJson, Sparkles } from 'lucide-react';
import { getExportJsonlUrl } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  dbId: string;
  dbName: string;
  selectedDocId?: string;
  selectedDocName?: string;
}

export const ExportJsonlModal: React.FC<Props> = ({
  isOpen,
  onClose,
  dbId,
  dbName,
  selectedDocId,
  selectedDocName,
}) => {
  const [format, setFormat] = useState<'messages' | 'alpaca' | 'completion'>('messages');
  const [syntheticOnly, setSyntheticOnly] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful domain assistant trained on document context.');
  const [scope, setScope] = useState<'all' | 'selected'>(selectedDocId ? 'selected' : 'all');

  if (!isOpen) return null;

  const handleExport = () => {
    const docIds = scope === 'selected' && selectedDocId ? [selectedDocId] : undefined;
    const url = getExportJsonlUrl(dbId, format, syntheticOnly, docIds, systemPrompt);
    
    // Trigger browser file download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dbId}_finetune_${format}.jsonl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass-panel" style={{ maxWidth: '520px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileJson size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Export JSONL for LLM Fine-Tuning</h2>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
            Database: <strong>{dbName}</strong> ({dbId})
          </div>
          {selectedDocName && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Target Document: <code>{selectedDocName}</code>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem' }}>
            1. Select Fine-Tuning Format:
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: format === 'messages' ? 'rgba(99, 102, 241, 0.12)' : 'transparent' }}>
              <input
                type="radio"
                name="format"
                value="messages"
                checked={format === 'messages'}
                onChange={() => setFormat('messages')}
                style={{ marginTop: '0.25rem' }}
              />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Chat / Messages Format (OpenAI / Llama-3 / Unsloth)</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <code>{`{"messages": [{"role":"system"...}, {"role":"user"...}, {"role":"assistant"...}]}`}</code>
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: format === 'alpaca' ? 'rgba(99, 102, 241, 0.12)' : 'transparent' }}>
              <input
                type="radio"
                name="format"
                value="alpaca"
                checked={format === 'alpaca'}
                onChange={() => setFormat('alpaca')}
                style={{ marginTop: '0.25rem' }}
              />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Alpaca / Instruction Format</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <code>{`{"instruction": "...", "input": "...", "output": "..."}`}</code>
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: format === 'completion' ? 'rgba(99, 102, 241, 0.12)' : 'transparent' }}>
              <input
                type="radio"
                name="format"
                value="completion"
                checked={format === 'completion'}
                onChange={() => setFormat('completion')}
                style={{ marginTop: '0.25rem' }}
              />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Prompt / Completion Format</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <code>{`{"prompt": "...", "completion": "..."}`}</code>
                </div>
              </div>
            </label>
          </div>
        </div>

        {selectedDocId && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem' }}>
              2. Export Scope:
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                />
                Selected Document (<code>{selectedDocName}</code>)
              </label>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                Entire Database ({dbName})
              </label>
            </div>
          </div>
        )}

        {format === 'messages' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              System Prompt (for Chat Format):
            </label>
            <input
              type="text"
              className="input-field"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are an expert domain assistant."
            />
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={syntheticOnly}
              onChange={(e) => setSyntheticOnly(e.target.checked)}
            />
            <span>Only export chunks with Synthetic Q&A pairs (high quality pairs)</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export .jsonl
          </button>
        </div>
      </div>
    </div>
  );
};
