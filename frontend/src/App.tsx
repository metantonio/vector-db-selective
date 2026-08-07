import React, { useState, useEffect } from 'react';
import { FileText, Search, MessageSquare } from 'lucide-react';
import { VectorDatabase, DocumentItem, ChunkResult, QueryResponse } from './types';
import * as api from './api';
import { DbSelectorBar } from './components/DbSelectorBar';
import { CreateDbModal } from './components/CreateDbModal';
import { DocumentManager } from './components/DocumentManager';
import { VectorSearchSandbox } from './components/VectorSearchSandbox';
import { RagChatView } from './components/RagChatView';

export function App() {
  const [databases, setDatabases] = useState<VectorDatabase[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>('default');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'search' | 'chat'>('documents');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Load databases on mount
  useEffect(() => {
    loadDatabases();
  }, []);

  // Load documents whenever selectedDbId changes
  useEffect(() => {
    if (selectedDbId) {
      loadDocuments(selectedDbId);
    }
  }, [selectedDbId]);

  const loadDatabases = async () => {
    try {
      const dbs = await api.fetchDatabases();
      setDatabases(dbs);
      if (dbs.length > 0 && !dbs.find((d) => d.id === selectedDbId)) {
        setSelectedDbId(dbs[0].id);
      }
    } catch (err) {
      console.error('Failed to load databases', err);
    }
  };

  const loadDocuments = async (dbId: string) => {
    setLoadingDocs(true);
    try {
      const docs = await api.fetchDocuments(dbId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleCreateDatabase = async (id: string, name: string, description: string) => {
    await api.createDatabase(id, name, description);
    await loadDatabases();
    setSelectedDbId(id);
  };

  const handleDeleteDatabase = async (dbId: string) => {
    if (!window.confirm(`Are you sure you want to delete database "${dbId}" and all its contents?`)) return;
    try {
      await api.deleteDatabase(dbId);
      await loadDatabases();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUploadDocuments = async (files: File[], folder: string, enrichQa: boolean = false, parentChild: boolean = false) => {
    await api.uploadDocuments(selectedDbId, files, folder, enrichQa, parentChild);
    await loadDocuments(selectedDbId);
    await loadDatabases();
  };

  const handleDeleteDocument = async (docId: string) => {
    await api.deleteDocument(selectedDbId, docId);
    await loadDocuments(selectedDbId);
    await loadDatabases();
  };

  const handleVectorSearch = async (query: string, topK: number, minScore: number): Promise<ChunkResult[]> => {
    return await api.searchVectorDb(selectedDbId, query, topK, minScore);
  };

  const handleRagQuery = async (
    query: string,
    topK: number,
    useOllama: boolean = true,
    model?: string,
    systemInstruction?: string,
    provider: string = 'local',
    apiKey?: string
  ): Promise<QueryResponse> => {
    return await api.queryRagEngine(selectedDbId, query, topK, useOllama, model, systemInstruction, provider, apiKey);
  };



  return (
    <div className="app-container">
      {/* Top Header & DB Selector */}
      <DbSelectorBar
        databases={databases}
        selectedDbId={selectedDbId}
        onSelectDb={setSelectedDbId}
        onOpenCreateModal={() => setIsModalOpen(true)}
        onDeleteDb={handleDeleteDatabase}
      />

      {/* Main Container */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Navigation Tabs */}
        <div className="tabs-container">
          <button
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <FileText size={16} /> Document Ingestion & Storage
          </button>
          <button
            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={16} /> Vector Search Sandbox
          </button>
          <button
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={16} /> Selective RAG Q&A
          </button>
        </div>

        {/* View Content */}
        <div className="main-content">
          {activeTab === 'documents' && (
            <DocumentManager
              dbId={selectedDbId}
              documents={documents}
              loading={loadingDocs}
              onUpload={handleUploadDocuments}
              onDelete={handleDeleteDocument}
              onRefresh={() => loadDocuments(selectedDbId)}
            />
          )}

          {activeTab === 'search' && (
            <VectorSearchSandbox
              dbId={selectedDbId}
              onSearch={handleVectorSearch}
            />
          )}

          {activeTab === 'chat' && (
            <RagChatView
              dbId={selectedDbId}
              onQuery={handleRagQuery}
            />
          )}
        </div>
      </div>

      {/* Modal for Creating New Database */}
      <CreateDbModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateDatabase}
      />
    </div>
  );
}

export default App;
