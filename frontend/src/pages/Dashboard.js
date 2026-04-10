import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UploadZone from '../components/UploadZone';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';

const IN_FLIGHT = new Set(['uploading', 'processing', 'completed', 'vectorized']);

function Dashboard({ user }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;
      const response = await fetch(`${apiEndpoint}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      const docs = data.documents || [];
      setDocuments(docs);
      if (!docs.some(d => IN_FLIGHT.has(d.status))) {
        stopPolling();
      }
      return docs;
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err.message);
      stopPolling();
      return [];
    }
  }, [stopPolling]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const docs = await fetchDocuments();
    setLoading(false);
    if (docs.some(d => IN_FLIGHT.has(d.status)) && !pollRef.current) {
      pollRef.current = setInterval(fetchDocuments, 5000);
    }
  }, [fetchDocuments]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleUploadComplete = () => {
    setShowUpload(false);
    loadDocuments();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'uploading': return 'status-uploading';
      case 'processing': return 'status-processing';
      case 'completed': return 'status-processing';
      case 'vectorized': return 'status-processing';
      case 'summary_generated': return 'status-summary';
      default: return '';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'uploading': return 'Uploading';
      case 'processing': return 'Processing';
      case 'completed': return 'Processing';
      case 'vectorized': return 'Ready to chat';
      case 'summary_generated': return 'Summary ready';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="blade-loader" />
        <span className="font-body text-blade-body-sm text-blade-text-muted tracking-[0.02em]">Loading your study hub...</span>
      </div>
    );
  }

  const sorted = [...documents].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at) : 0;
    const db = b.created_at ? new Date(b.created_at) : 0;
    return db - da;
  });
  const recentDocs = sorted.slice(0, 5);
  const heroDoc = sorted.find(d => d.status === 'summary_generated') || sorted.find(d => d.status === 'processing') || null;
  const summariesReady = documents.filter(d => d.status === 'summary_generated').length;
  const processingCount = documents.filter(d => d.status === 'processing').length;

  const contextLine = () => {
    if (summariesReady > 0) return `You have ${summariesReady} ${summariesReady === 1 ? 'summary' : 'summaries'} ready to read.`;
    if (processingCount > 0) return `${processingCount} ${processingCount === 1 ? 'document' : 'documents'} currently processing.`;
    if (documents.length > 0) return 'Your documents are ready to explore.';
    return null;
  };

  if (documents.length === 0) {
    return (
      <div className="dashboard">
        <span className="font-body text-blade-section-label text-blade-text-faint uppercase tracking-[0.1em]">Study Hub</span>

        <div className="text-center py-16 mt-4">
          <div className="mx-auto mb-4 opacity-25">
            <svg width="48" height="48" viewBox="0 0 28 28" className="text-blade-text-muted">
              <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
              <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
            </svg>
          </div>
          <h3 className="font-body text-blade-card-title font-semibold text-blade-text-muted mb-2">Your study hub is empty</h3>
          <p className="font-body text-blade-body-sm text-blade-text-faint mb-8 max-w-sm mx-auto">
            Upload a PDF and we'll create summaries, glossaries, and let you chat with your documents.
          </p>
          {showUpload ? (
            <div className="max-w-md mx-auto w-full">
              <UploadZone onUploadComplete={handleUploadComplete} />
              <button onClick={() => setShowUpload(false)} className="btn btn-secondary mt-3 w-full">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowUpload(true)} className="btn btn-primary">Upload Your First PDF</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <span className="font-body text-blade-section-label text-blade-text-faint uppercase tracking-[0.1em]">Study Hub</span>
      {contextLine() && (
        <p className="font-body text-blade-body-sm text-blade-text-muted tracking-[0.02em] mt-2 mb-6">{contextLine()}</p>
      )}

      {error && <div className="error">{error}</div>}

      {heroDoc && (
        <div className="card hub-hero animate-blade-emerge" style={{ animationDelay: '0ms' }}>
          <span className="font-mono text-blade-body-sm text-blade-accent uppercase tracking-[0.1em]">Next Up</span>
          {heroDoc.summary_title && (
            <h3 className="font-body text-blade-card-title font-semibold text-blade-text mt-2 mb-1">"{heroDoc.summary_title}"</h3>
          )}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-body text-blade-body-sm text-blade-text-muted">{heroDoc.filename}</span>
            <span className="text-blade-text-faint">&middot;</span>
            <span className={`status-badge ${getStatusClass(heroDoc.status)}`}>{getStatusLabel(heroDoc.status)}</span>
          </div>
          <div className="hub-actions">
            {heroDoc.status === 'summary_generated' && (
              <Link to={`/documents/${heroDoc.document_id}`} className="btn-summary">Read Summary</Link>
            )}
          </div>
        </div>
      )}

      <div className="hub-upload-cta animate-blade-emerge" style={{ animationDelay: '80ms' }}>
        {showUpload ? (
          <div className="w-full">
            <UploadZone onUploadComplete={handleUploadComplete} />
            <button onClick={() => setShowUpload(false)} className="btn btn-secondary mt-3 w-full">Cancel</button>
          </div>
        ) : (
          <>
            <span className="font-body text-blade-body text-blade-text-muted">+ Upload another PDF</span>
            <button onClick={() => setShowUpload(true)} className="btn btn-primary">Upload Document</button>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 mt-2 mb-3 flex-wrap">
        <span className="font-body text-blade-section-label text-blade-text-faint uppercase tracking-[0.1em]">Recent Documents</span>
        {processingCount > 0 && (
          <span className="font-body text-blade-body-sm text-blade-text-faint flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--blade-accent)' }} />Processing — being analyzed</span>
            <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--blade-success, #48bb78)' }} />Summary ready — tap Read</span>
          </span>
        )}
      </div>

      <div className="document-list">
        {recentDocs.map((doc, index) => (
          <Link
            key={doc.document_id}
            to={`/documents/${doc.document_id}`}
            className="document-item-link animate-blade-emerge"
            style={{ animationDelay: `${(index + 1) * 80}ms` }}
          >
            <div className="document-info">
              <h4>{doc.filename}</h4>
              {doc.summary_title && (
                <p style={{ fontStyle: 'italic', color: 'var(--blade-text-secondary)' }}>"{doc.summary_title}"</p>
              )}
              <p>{formatDate(doc.created_at)}</p>
            </div>
            <span className={`status-badge ${getStatusClass(doc.status)}`}>{getStatusLabel(doc.status)}</span>
          </Link>
        ))}
      </div>

    </div>
  );
}

export default Dashboard;
