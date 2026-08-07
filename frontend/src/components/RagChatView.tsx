import React, { useState, useEffect } from 'react';
import { Send, Bot, User, FileText, ChevronDown, ChevronUp, Cpu, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { QueryResponse, ChunkResult, OllamaStatus } from '../types';
import * as api from '../api';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  chunks?: ChunkResult[];
  ollamaActive?: boolean;
  modelUsed?: string;
}

interface Props {
  dbId: string;
  onQuery: (
    query: string,
    topK: number,
    useOllama: boolean,
    model?: string,
    systemInstruction?: string
  ) => Promise<QueryResponse>;
}

export const RagChatView: React.FC<Props> = ({ dbId, onQuery }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: `Hello! I am ready to answer your questions using context retrieved from vector database **${dbId}**. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Record<number, boolean>>({});

  // Ollama states
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [useOllama, setUseOllama] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [checkingOllama, setCheckingOllama] = useState<boolean>(false);

  const checkOllama = async () => {
    setCheckingOllama(true);
    try {
      const status = await api.fetchOllamaStatus();
      setOllamaStatus(status);
      if (status.available && status.models.length > 0) {
        if (!selectedModel || !status.models.includes(selectedModel)) {
          setSelectedModel(status.default_model || status.models[0]);
        }
      }
    } catch (err) {
      setOllamaStatus({ available: false, url: 'http://localhost:11434', models: [] });
    } finally {
      setCheckingOllama(false);
    }
  };

  useEffect(() => {
    checkOllama();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setLoading(true);

    try {
      const response = await onQuery(userText, 4, useOllama, selectedModel);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: response.answer,
          chunks: response.context_chunks,
          ollamaActive: response.ollama_active,
          modelUsed: response.model_used,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `⚠️ Error querying database **${dbId}**: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedChunks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.25rem' }}>
      {/* Ollama Control Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 1rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--border-color)',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontWeight: 600, color: 'white' }}>Ollama LLM Engine:</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: ollamaStatus?.available ? '#10b981' : '#ef4444',
                boxShadow: ollamaStatus?.available ? '0 0 8px #10b981' : '0 0 8px #ef4444',
              }}
            />
            <span style={{ color: ollamaStatus?.available ? '#10b981' : '#ef4444', fontSize: '0.8rem', fontWeight: 500 }}>
              {checkingOllama
                ? 'Checking...'
                : ollamaStatus?.available
                ? `Online (${ollamaStatus.url})`
                : 'Offline (Fallback Mode)'}
            </span>
          </div>

          <button
            onClick={checkOllama}
            title="Refresh Ollama status"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={13} className={checkingOllama ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {ollamaStatus?.available && ollamaStatus.models.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Model:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: 'white',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              >
                {ollamaStatus.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={useOllama}
              onChange={(e) => setUseOllama(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            Use Ollama AI
          </label>
        </div>
      </div>

      {/* Messages List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            {msg.sender === 'assistant' && (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: msg.ollamaActive
                    ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                    : 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                <Bot size={18} />
              </div>
            )}

            <div
              style={{
                background: msg.sender === 'user' ? 'var(--accent-primary)' : 'rgba(15, 23, 42, 0.7)',
                color: 'white',
                padding: '0.85rem 1.1rem',
                borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                border: msg.sender === 'assistant' ? '1px solid var(--border-color)' : 'none',
                fontSize: '0.9rem',
                lineHeight: 1.5,
              }}
            >
              {msg.ollamaActive && (
                <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Cpu size={12} /> Generated by Ollama ({msg.modelUsed || 'LLM'})
                </div>
              )}

              <div className="markdown-content">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>

              {msg.chunks && msg.chunks.length > 0 && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
                  <button
                    onClick={() => toggleExpand(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: 0,
                    }}
                  >
                    <FileText size={14} /> Context Sources ({msg.chunks.length} chunks)
                    {expandedChunks[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedChunks[idx] && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {msg.chunks.map((c) => (
                        <div
                          key={c.chunk_id}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                          }}
                        >
                          <div style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                            {c.filename} (Score: {(c.score * 100).toFixed(1)}%)
                          </div>
                          <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>{c.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {msg.sender === 'user' && (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                <User size={18} />
              </div>
            )}
          </div>
        ))}

        {/* AI Loading & Thinking Indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: '0.75rem', alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                flexShrink: 0,
              }}
            >
              <Bot size={18} className="spin" />
            </div>
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: 'var(--accent-cyan)',
                padding: '0.85rem 1.1rem',
                borderRadius: '12px 12px 12px 2px',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.15)',
              }}
            >
              <RefreshCw size={16} className="spin" />
              <span>Thinking & generating answer with <strong>{selectedModel || 'AI Engine'}</strong>...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <input
          type="text"
          className="input-field"
          style={{ marginTop: 0 }}
          disabled={loading}
          placeholder={
            loading
              ? `🤖 AI is generating answer for "${dbId}"...`
              : ollamaStatus?.available && useOllama
              ? `Ask a question (Ollama LLM active on "${dbId}")...`
              : `Ask a question based on database "${dbId}"...`
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
          {loading ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
          {loading ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </div>
  );
};


