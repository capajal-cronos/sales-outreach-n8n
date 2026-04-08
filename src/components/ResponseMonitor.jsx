import { useState, useEffect } from 'react';
import './ResponseMonitor.css';

function ResponseMonitor({ onPrevious }) {
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchResponses();
    const interval = setInterval(fetchResponses, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchResponses = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/responses');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setResponses(data.responses || []);
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="response-monitor">
      <div className="section-header">
        <h2>📊 Response Monitor</h2>
        <p>
          Replies detected automatically via IMAP · auto-refreshes every 10s
          {lastUpdated && (
            <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              · last updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      <div className="stats-dashboard">
        <div className="stats-row">
          <div className="stat-card highlight">
            <div className="stat-icon">💬</div>
            <div className="stat-content">
              <div className="stat-value">{responses.length}</div>
              <div className="stat-label">Total Replies</div>
            </div>
          </div>
        </div>
      </div>

      <div className="responses-section">
        <div className="responses-header">
          <h3>Replies ({responses.length})</h3>
        </div>

        {isLoading ? (
          <div className="empty-responses">
            <p>Loading responses...</p>
          </div>
        ) : responses.length === 0 ? (
          <div className="empty-responses">
            <p>💬 No replies yet.</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Replies are detected automatically when someone replies to your outreach emails.
              Make sure your n8n IMAP workflow is active.
            </p>
          </div>
        ) : (
          <div className="responses-list">
            {responses.map(response => (
              <div key={response.id} className="response-card reply">
                <div className="response-header">
                  <div className="response-icon">💬</div>
                  <div className="response-info">
                    <h4>{response.person_name || response.from}</h4>
                    <p className="response-meta">
                      {response.from}
                      {response.lead_title && ` · ${response.lead_title}`}
                    </p>
                  </div>
                  <div className="response-time">
                    {new Date(response.date || response.received_at).toLocaleString()}
                  </div>
                </div>

                <div className="response-body">
                  <p className="response-campaign">
                    <strong>Subject:</strong> {response.subject}
                  </p>
                  {response.snippet && (
                    <div className="response-content">
                      <p>{response.snippet}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResponseMonitor;
