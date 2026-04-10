import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';
import SummaryRenderer from '../components/SummaryRenderer';

function SummaryView({ user }) {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
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
          throw new Error('Summary not found for this document.');
        }

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch summary');
        }

        const data = await response.json();
        setSummary(data.generated_summary);
      } catch (err) {
        console.error('Summary fetch error:', err);
        setError(err.message || 'Failed to load summary');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="blade-loader" />
        <span className="font-body text-blade-body-sm text-blade-text-muted tracking-[0.02em]">Loading summary...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <Link to="/documents" className="inline-block mb-4 text-blade-accent font-body text-blade-body-sm tracking-[0.02em] uppercase hover:text-blade-accent-deep transition-colors duration-[250ms]">
          &larr; Back to Documents
        </Link>
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <Link to="/documents" className="inline-block mb-4 text-blade-accent font-body text-blade-body-sm tracking-[0.02em] uppercase hover:text-blade-accent-deep transition-colors duration-[250ms]">
          &larr; Back to Documents
        </Link>

        <SummaryRenderer summary={summary} />
      </div>
    </div>
  );
}

export default SummaryView;
