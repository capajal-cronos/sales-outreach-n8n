import { useState, useEffect } from 'react';
import './ResponseMonitor.css';

function ResponseMonitor() {
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterSender, setFilterSender] = useState('');
  useEffect(() => {
    fetchResponses();
    const interval = setInterval(fetchResponses, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const formatTimeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

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
        <h2>Response Monitor</h2>
        <p>Track incoming replies from your email campaigns</p>
      </div>
      <p className="response-meta">
        {responses.length} repl{responses.length === 1 ? 'y' : 'ies'} · auto-refreshes every 10s
        {lastUpdated && (
          <span> · last updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </p>

      {responses.length > 0 && (
        <div className="response-filters">
          <input
            type="text"
            className="filter-input"
            placeholder="Filter by sender..."
            value={filterSender}
            onChange={e => setFilterSender(e.target.value)}
          />
        </div>
      )}

      <div className="responses-section">
        {isLoading ? (
          <div className="empty-responses"><p>Loading responses...</p></div>
        ) : responses.length === 0 ? (
          <div className="empty-responses">
            <p>No replies yet. Make sure your n8n IMAP workflow is active.</p>
          </div>
        ) : (
          <table className="replies-table">
            <thead>
              <tr>
                <th>Sender</th>
                <th>Lead</th>
                <th>Reply</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {responses.filter(response => {
                const name = (response.person_name || response.from || '').toLowerCase();
                if (filterSender && !name.includes(filterSender.toLowerCase())) return false;
                return true;
              }).map(response => {
                const snippet = response.snippet || response.body || '';
                const senderName = response.person_name || response.from || '(unknown)';
                const dateStr = response.date || response.received_at;
                return (
                  <tr key={response.id} className="reply-row" onClick={() => setSelected(response)}>
                    <td className="reply-sender">{senderName}</td>
                    <td className="reply-lead">{response.lead_title || '—'}</td>
                    <td className="reply-preview">{snippet.substring(0, 100) || '(no text)'}</td>
                    <td className="reply-date" title={new Date(dateStr).toLocaleString()}>{formatTimeAgo(dateStr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="reply-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="reply-modal" onClick={e => e.stopPropagation()}>
            <div className="reply-modal-header">
              <div>
                <div className="reply-modal-subject">{selected.subject || '(no subject)'}</div>
                <div className="reply-modal-meta">
                  {selected.person_name || selected.from}
                  {selected.lead_title && <span> · {selected.lead_title}</span>}
                  <span> · {formatTimeAgo(selected.date || selected.received_at)}</span>
                </div>
              </div>
              <button className="reply-modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="reply-modal-body">
              {selected.original ? (
                <div className="reply-modal-original">
                  <div className="reply-modal-label">Your email</div>
                  <pre className="reply-modal-text">{selected.original}</pre>
                </div>
              ) : (
                <div className="reply-modal-original">
                  <div className="reply-modal-label" style={{ fontStyle: 'italic', color: '#999' }}>Original email not captured</div>
                </div>
              )}
              <div className="reply-modal-reply">
                <div className="reply-modal-label">Their reply</div>
                <pre className="reply-modal-text">{selected.snippet || selected.body || '(no reply text)'}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResponseMonitor;
