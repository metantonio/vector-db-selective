import React, { useState, useEffect } from 'react';
import { Send, Bot, User, FileText, ChevronDown, ChevronUp, Cpu, RefreshCw, Key, ShieldCheck } from 'lucide-react';
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
    systemInstruction?: string,
    provider?: string,
    apiKey?: string
  ) => Promise<QueryResponse>;
}

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-001', 'openai/gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
};

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

  // LLM Provider & Model States
  const [provider, setProvider] = useState<string>('local');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);

  // Local Ollama states
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [checkingOllama, setCheckingOllama] = useState<boolean>(false);

  const checkOllama = async () => {
    setCheckingOllama(true);
    try {
      const status = await api.fetchOllamaStatus();
      setOllamaStatus(status);
      if (provider === 'local' && status.available && status.models.length > 0) {
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

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    if (newProvider === 'local') {
      if (ollamaStatus?.available && ollamaStatus.models.length > 0) {
        setSelectedModel(ollamaStatus.default_model || ollamaStatus.models[0]);
      } else {
        setSelectedModel('llama.cpp');
      }
    } else {
      const defaultM = PROVIDER_MODELS[newProvider]?.[0] || '';
      setSelectedModel(defaultM);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    // Add user message & empty assistant placeholder for streaming tokens
    const userMsg: Message = { sender: 'user', text: userText };
    const assistantPlaceholder: Message = {
      sender: 'assistant',
      text: '',
      ollamaActive: true,
      modelUsed: `${provider.toUpperCase()} (${selectedModel || 'AI'})`
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setLoading(true);

    try {
      await api.queryRagEngineStream(
        dbId,
        userText,
        4,
        true,
        selectedModel,
        undefined,
        provider,
        apiKey,
        (meta) => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last.sender !== 'assistant') return prev;
            return [
              ...prev.slice(0, lastIdx),
              { ...last, chunks: meta.chunks, modelUsed: meta.modelUsed }
            ];
          });
        },
        (token) => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last.sender !== 'assistant') return prev;
            return [
              ...prev.slice(0, lastIdx),
              { ...last, text: (last.text || '') + token }
            ];
          });
        }
      );
    } catch (err: any) {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const lastIdx = prev.length - 1;
        const last = prev[lastIdx];
        if (last.sender !== 'assistant') return prev;
        return [
          ...prev.slice(0, lastIdx),
          { ...last, text: `⚠️ Error querying database **${dbId}**: ${err.message}` }
        ];
      });
    } finally {
      setLoading(false);
    }
  };



  const toggleExpand = (index: number) => {
    setExpandedChunks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const getAvailableModels = (): string[] => {
    if (provider === 'local') {
      return ollamaStatus?.models || ['llama.cpp'];
    }
    return PROVIDER_MODELS[provider] || [];
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.25rem' }}>
      {/* Multi-Provider LLM Control Bar */}
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
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontWeight: 600, color: 'white' }}>Chat Synthesis Engine:</span>

          {/* Provider Selector */}
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{
              background: 'rgba(30, 41, 59, 0.9)',
              color: 'white',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '6px',
              padding: '0.3rem 0.6rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="local">🏠 Local LLM (llama.cpp / Ollama)</option>
            <option value="openai">🟢 OpenAI (ChatGPT / GPT-4o)</option>
            <option value="claude">🟣 Anthropic (Claude 3.5 Sonnet)</option>
            <option value="openrouter">🌐 OpenRouter (Multi-Provider)</option>
            <option value="gemini">🔷 Google Gemini (Gemini 2.0 / 1.5)</option>
          </select>

          {/* Model Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: 'white',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '0.3rem 0.6rem',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {getAvailableModels().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Local Status Indicator */}
          {provider === 'local' && (
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
              <span style={{ color: ollamaStatus?.available ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 500 }}>
                {checkingOllama ? 'Checking...' : ollamaStatus?.available ? 'Online' : 'Offline'}
              </span>
              <button
                onClick={checkOllama}
                title="Refresh local LLM status"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <RefreshCw size={12} className={checkingOllama ? 'spin' : ''} />
              </button>
            </div>
          )}
        </div>

        {/* API Key Toggle for Cloud Providers */}
        {provider !== 'local' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: apiKey ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
              title="Enter custom API key if not set in .env"
            >
              <Key size={13} /> {apiKey ? 'API Key Saved' : 'Custom API Key'}
            </button>

            {showApiKeyInput && (
              <input
                type="password"
                className="input-field"
                style={{ width: '180px', marginTop: 0, padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter ${provider.toUpperCase()} API Key...`}
              />
            )}
          </div>
        )}
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
                  <Cpu size={12} /> {msg.modelUsed || 'LLM Synthesis'}
                </div>
              )}

              {!msg.text ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                  <RefreshCw size={15} className="spin" />
                  <span>Thinking & streaming response...</span>
                </div>
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}


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
              : `Ask a question using ${provider.toUpperCase()} on "${dbId}"...`
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


