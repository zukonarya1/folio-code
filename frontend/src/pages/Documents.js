import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';
import UploadZone from '../components/UploadZone';

function Documents({ user }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;

      const response = await fetch(`${apiEndpoint}/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'uploading': return 'status-uploading';
      case 'processing': return 'status-processing';
      case 'completed': return 'status-processing';
      case 'vectorized': return 'status-processing';
      case 'summary_generated': return 'status-summary';
      case 'limit_exceeded': return 'status-limit-exceeded';
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
      case 'limit_exceeded': return 'Limit reached';
      default: return status;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="blade-loader" />
        <span className="font-body text-blade-body-sm text-blade-text-muted tracking-[0.02em]">Loading documents...</span>
      </div>
    );
  }

  return (
    <div className="documents-page">
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2>Your Documents</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowUpload(prev => !prev)} className="btn btn-primary">
              {showUpload ? 'Cancel' : 'Upload'}
            </button>
            <button onClick={loadDocuments} className="btn btn-secondary">
              Refresh
            </button>
          </div>
        </div>

        {showUpload && (
          <div className="mb-4">
            <UploadZone onUploadComplete={() => { setShowUpload(false); loadDocuments(); }} />
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {documents.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto mb-4 opacity-25">
              <svg width="48" height="48" viewBox="0 0 28 28" className="text-blade-text-muted">
                <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
                <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
              </svg>
            </div>
            <h3 className="font-body text-blade-card-title font-semibold text-blade-text-muted mb-2">Nothing here yet</h3>
            <p className="font-body text-blade-body-sm text-blade-text-faint mb-8">Upload your first document to get started.</p>
            <button onClick={() => setShowUpload(true)} className="btn btn-primary">
              Upload Document
            </button>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc, index) => (
              <div
                key={doc.document_id}
                className="document-item animate-blade-emerge cursor-pointer"
                style={{ animationDelay: `${index * 80}ms` }}
                onClick={() => navigate(`/documents/${doc.document_id}`)}
              >
                <div className="document-info">
                  <h4>{doc.filename}</h4>
                  <p>
                    Uploaded: {formatDate(doc.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`status-badge ${getStatusClass(doc.status)}`}>
                    {getStatusLabel(doc.status)}
                  </span>
                  {(doc.status === 'summary_generated' || doc.status === 'vectorized') && (
                    <span className="btn-summary">View</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-24 h-px bg-blade-border mx-auto opacity-50 my-8" />

      <div className="card">
        <h2>Document Status</h2>
        <div className="flex flex-col md:flex-row gap-4 flex-wrap mt-4">
          <div>
            <span className="status-badge status-processing">Processing</span>
            <span className="ml-2 text-blade-text-faint text-blade-body-sm">— being read and indexed</span>
          </div>
          <div>
            <span className="status-badge status-processing">Ready to chat</span>
            <span className="ml-2 text-blade-text-faint text-blade-body-sm">— you can ask questions</span>
          </div>
          <div>
            <span className="status-badge status-summary">Summary ready</span>
            <span className="ml-2 text-blade-text-faint text-blade-body-sm">— digest and glossary available</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Documents;
