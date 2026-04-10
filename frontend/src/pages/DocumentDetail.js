import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';
import ChatPanel from '../components/ChatPanel';
import SummaryRenderer from '../components/SummaryRenderer';

function DocumentDetail({ user }) {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docMeta, setDocMeta] = useState(null);
  const [summaryExpanded, setSummaryExpanded] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;

        const response = await fetch(`${apiEndpoint}/documents/${id}/summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 404) {
          if (!cancelled) {
            setSummary(null);
          }
          return;
        }

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch summary');
        }

        const data = await response.json();
        if (!cancelled) {
          setSummary(data.generated_summary);
        }
      } catch (err) {
        console.error('Summary fetch error:', err);
        if (!cancelled) {
          setError(err.message || 'Failed to load summary');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchSummary();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const fetchDocMeta = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;
        const response = await fetch(`${apiEndpoint}/documents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        const doc = (data.documents || []).find(d => d.document_id === id);
        if (!cancelled && doc) setDocMeta(doc);
      } catch (err) {
        console.error('Doc meta fetch error:', err);
      }
    };
    fetchDocMeta();
    return () => { cancelled = true; };
  }, [id]);

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

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateString; }
  };

  const scrollToChat = () => {
    document.getElementById('chat-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  const backLink = (
    <Link
      to="/"
      className="inline-block mb-4 text-blade-accent font-body text-blade-body-sm tracking-[0.02em] uppercase hover:text-blade-accent-deep transition-colors duration-[250ms]"
    >
      &larr; Back to Study Hub
    </Link>
  );

  const renderSummaryContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="blade-loader" />
          <span className="font-body text-blade-body-sm text-blade-text-muted tracking-[0.02em]">Loading summary...</span>
        </div>
      );
    }

    if (error) {
      return <div className="error">{error}</div>;
    }

    if (!summary) {
      return (
        <p className="font-body text-blade-text-muted text-blade-body-sm tracking-[0.02em]">
          Summary is being generated. You can start chatting while you wait.
        </p>
      );
    }

    return <SummaryRenderer summary={summary} />;
  };

  return (
    <div className="document-detail">
      {backLink}

      {docMeta && (
        <div className="document-detail-header card">
          <h3 className="font-body text-blade-card-title font-semibold text-blade-text mb-1">{docMeta.filename}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body text-blade-body-sm text-blade-text-muted">{formatDate(docMeta.created_at)}</span>
            <span className="text-blade-text-faint">&middot;</span>
            <span className="font-mono text-blade-body-sm text-blade-accent uppercase tracking-[0.05em]">{getStatusLabel(docMeta.status)}</span>
          </div>
          <button onClick={scrollToChat} className="jump-to-chat-btn lg:hidden mt-3 btn btn-secondary">Jump to Chat</button>
        </div>
      )}

      <div className="document-detail-layout">
        <div className="document-detail-summary">
          <div className="card">
            <div className={`summary-collapsible ${summaryExpanded ? 'expanded' : ''}`}>
              {renderSummaryContent()}
              {!summaryExpanded && <div className="summary-fade" />}
            </div>
            {!loading && summary && (
              <button
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="summary-expand-btn"
              >
                {summaryExpanded ? 'Collapse summary' : 'Read full summary'}
              </button>
            )}
          </div>
        </div>

        <div id="chat-panel" className="document-detail-chat">
          <ChatPanel documentId={id} user={user} />
        </div>
      </div>
    </div>
  );
}

export default DocumentDetail;