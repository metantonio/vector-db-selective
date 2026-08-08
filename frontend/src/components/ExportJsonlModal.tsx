import React, { useState, useRef } from 'react';
import { X, Download, FileJson, Sparkles, UploadCloud, Database, RefreshCw } from 'lucide-react';
import { getExportJsonlUrl, startJsonlRefineTask, fetchJsonlRefineTaskStatus, getJsonlRefineDownloadUrl } from '../api';

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
  const [activeTab, setActiveTab] = useState<'db_export' | 'file_refine'>('db_export');
  
  // Tab 1: Export DB State
  const [format, setFormat] = useState<'messages' | 'alpaca' | 'completion'>('messages');
  const [syntheticOnly, setSyntheticOnly] = useState(false);
  const [refineAnswers, setRefineAnswers] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful domain assistant trained on document context.');
  const [scope, setScope] = useState<'all' | 'selected'>(selectedDocId ? 'selected' : 'all');

  // Tab 2: Refine Existing File State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [refiningFile, setRefiningFile] = useState(false);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}h ${remM}m`;
    }
    if (m > 0) {
      return `${m}m ${s}s`;
    }
    return `${s}s`;
  };

  const handleExportDb = () => {
    const docIds = scope === 'selected' && selectedDocId ? [selectedDocId] : undefined;
    const url = getExportJsonlUrl(dbId, format, syntheticOnly, docIds, systemPrompt, refineAnswers);
    
    // Trigger browser file download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dbId}_finetune_${format}.jsonl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onClose();
  };

  const handleRefineExistingFile = async () => {
    if (!selectedFile) return;
    setRefiningFile(true);
    setRefineError(null);
    try {
      const { task_id } = await startJsonlRefineTask(selectedFile);

      const interval = setInterval(async () => {
        const taskInfo = await fetchJsonlRefineTaskStatus(task_id);
        if (taskInfo) {
          setActiveTask(taskInfo);
          if (taskInfo.status === 'completed') {
            clearInterval(interval);
            setRefiningFile(false);

            // Auto-trigger file download from backend disk
            const downloadUrl = getJsonlRefineDownloadUrl(task_id);
            const link = document.createElement('a');
            link.href = downloadUrl;
            const base = selectedFile.name.replace('.jsonl', '');
            link.download = `${base}_refined.jsonl`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => {
              setActiveTask(null);
              onClose();
            }, 1200);
          } else if (taskInfo.status === 'failed') {
            clearInterval(interval);
            setRefiningFile(false);
            setRefineError(taskInfo.status_message || 'Refinement task failed');
          }
        }
      }, 1000);
    } catch (err: any) {
      setRefineError(err.message || 'Failed to start JSONL refinement task');
      setRefiningFile(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass-panel" style={{ maxWidth: '560px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileJson size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>JSONL Fine-Tuning & Refinement Studio</h2>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'db_export' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setActiveTab('db_export')}
          >
            <Database size={14} /> Export from Database
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'file_refine' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setActiveTab('file_refine')}
          >
            <UploadCloud size={14} /> Refine Existing .jsonl File
          </button>
        </div>

        {/* TAB 1: Export DB */}
        {activeTab === 'db_export' && (
          <>
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

            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '8px' }}>
              <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={refineAnswers}
                  onChange={(e) => setRefineAnswers(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                    Refine Answers with LLM (Concise Direct Answer + Source Citation)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.35 }}>
                    Uses local LLM to convert raw text dumps into direct answers citing the file e.g. <code>(Fuente: manual.pdf)</code>. Disables thinking mode (<code style={{ fontSize: '0.7rem' }}>&lt;think&gt;</code>) for speed.
                  </div>
                </div>
              </label>
            </div>

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
              <button type="button" className="btn btn-primary" onClick={handleExportDb}>
                <Download size={16} /> Export .jsonl
              </button>
            </div>
          </>
        )}

        {/* TAB 2: Refine Existing File */}
        {activeTab === 'file_refine' && (
          <>
            <div style={{ padding: '0.75rem', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
                Refine Existing Fine-Tuning Dataset (.jsonl)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                Upload any existing <code>.jsonl</code> file (e.g. <code>casino_db_finetune_messages.jsonl</code>). The background task processes each line incrementally to disk with real-time metrics. Thinking mode is automatically disabled.
              </div>
            </div>

            {refineError && (
              <div style={{ padding: '0.65rem', background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '6px', color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {refineError}
              </div>
            )}

            {/* Live Progress Card when Refining */}
            {refiningFile && activeTask && (
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RefreshCw size={16} className="spin" />
                    {activeTask.status_message || 'Refining JSONL dataset...'}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                    {activeTask.percentage ?? 0}%
                  </span>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.6rem' }}>
                  <div style={{ width: `${Math.max(activeTask.percentage ?? 5, 5)}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))', transition: 'width 0.3s ease' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  <div>Progress: <strong style={{ color: '#fff' }}>{activeTask.completed_chunks ?? 0} / {activeTask.total_chunks ?? 0}</strong></div>
                  <div>Avg Speed: <strong style={{ color: '#fff' }}>{activeTask.avg_speed_sec ?? 0}s</strong>/item</div>
                  <div>Elapsed: <strong style={{ color: '#fff' }}>{formatTime(activeTask.elapsed_seconds ?? 0)}</strong></div>
                  <div>ETA: <strong style={{ color: 'var(--accent-cyan)' }}>{formatTime(activeTask.eta_seconds ?? 0)}</strong></div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem' }}>
                Select Existing .jsonl File:
              </label>
              
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: refiningFile ? 'wait' : 'pointer',
                  background: selectedFile ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                  transition: 'all 0.2s ease',
                  pointerEvents: refiningFile ? 'none' : 'auto',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".jsonl,.json"
                  disabled={refiningFile}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />
                {selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                    <FileJson size={32} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedFile.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <UploadCloud size={32} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>Click to browse or drop your <code>.jsonl</code> file here</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supports Chat, Alpaca, and Prompt/Completion formats</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={refiningFile}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRefineExistingFile}
                disabled={!selectedFile || refiningFile}
              >
                {refiningFile ? (
                  <>
                    <RefreshCw size={16} className="spin" /> Refinement Active...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Start Refinement & Download
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
