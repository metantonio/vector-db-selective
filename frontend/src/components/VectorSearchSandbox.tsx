import React, { useState } from 'react';
import { Search, Sliders, FileText, CheckCircle2 } from 'lucide-react';
import { ChunkResult } from '../types';

interface Props {
  dbId: string;
  onSearch: (query: string, topK: number, minScore: number) => Promise<ChunkResult[]>;
}

export const VectorSearchSandbox: React.FC<Props> = ({ dbId, onSearch }) => {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [minScore, setMinScore] = useState(0.0);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await onSearch(query.trim(), topK, minScore);
      setResults(res);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      {/* Controls Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '2.5rem', marginTop: 0 }}
                placeholder={`Search vector chunks in database "${dbId}"...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Searching...' : 'Vector Search'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={15} /> Top K Chunks:
              <input
                type="number"
                min={1}
                max={20}
                className="input-field"
                style={{ width: '70px', marginTop: 0, padding: '0.2rem 0.5rem' }}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Min Score:
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
              />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{minScore.toFixed(2)}</span>
            </div>
          </div>
        </form>
      </div>

      {/* Results View */}
      <div className="glass-panel" style={{ flex: 1, padding: '1.25rem', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Search Results {searched && `(${results.length} matched)`}
        </h3>

        {!searched ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Enter a natural language query above to retrieve relevant text passages from <strong>{dbId}</strong>.
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No vector chunks matched your query in <strong>{dbId}</strong>. Try lowering the minimum score or rephrasing.
          </div>
        ) : (
          results.map((r) => (
            <div key={r.chunk_id} className="chunk-card">
              <div className="chunk-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)', fontWeight: 600 }}>
                  <FileText size={15} style={{ color: 'var(--accent-cyan)' }} />
                  {r.filename} <span style={{ opacity: 0.5 }}>#chunk-{r.chunk_index}</span>
                </span>
                <span className="score-badge">Cosine Score: {(r.score * 100).toFixed(1)}%</span>
              </div>
              <p style={{ color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
