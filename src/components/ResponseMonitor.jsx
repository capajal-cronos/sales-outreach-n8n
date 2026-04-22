import { useState, useEffect } from 'react';
import './ResponseMonitor.css';

const READ_STORAGE_KEY = 'responseMonitor.readIds';
const STATUS_STORAGE_KEY = 'responseMonitor.statuses';
const ARCHIVED_STORAGE_KEY = 'responseMonitor.archivedIds';

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key)) || []); } catch { return new Set(); }
}
function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
}
function loadStatuses() {
  try { return JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveStatuses(obj) {
  try { localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(obj)); } catch { /* ignore */ }
}

const STATUS_LABELS = { replied: 'Replied', followed_up: 'Followed up', not_interested: 'Not interested' };
const STATUS_COLORS = { replied: 'status-replied', followed_up: 'status-followed-up', not_interested: 'status-not-interested' };

// Repair UTF-8 text that was decoded as Windows-1252 upstream (n8n IMAP node).
// Reverses sequences like "â" for em-dash or "Ã©" for é.
const CP1252_EXTRAS = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};
function repairMojibake(str) {
  if (typeof str !== 'string' || !str) return str;
  if (!/[ÃÂâ€]/.test(str)) return str;
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const byte = code <= 0xFF ? code : CP1252_EXTRAS[code];
      if (byte === undefined) return str;
      bytes[i] = byte;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return str;
  }
}
function cleanResponse(r) {
  return {
    ...r,
    subject: repairMojibake(r.subject),
    from: repairMojibake(r.from),
    person_name: repairMojibake(r.person_name),
    lead_title: repairMojibake(r.lead_title),
    body: repairMojibake(r.body),
    snippet: repairMojibake(r.snippet),
    original: repairMojibake(r.original),
  };
}

function ResponseMonitor() {
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterSender, setFilterSender] = useState('');
  const [readIds, setReadIds] = useState(() => loadSet(READ_STORAGE_KEY));
  const [statuses, setStatuses] = useState(loadStatuses);
  const [archivedIds, setArchivedIds] = useState(() => loadSet(ARCHIVED_STORAGE_KEY));
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState({ col: null, dir: 'asc' });

  const toggleSort = (col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  };

  const sortIcon = (col) => {
    if (sort.col !== col) return <span style={{ marginLeft: '0.3rem', opacity: 0.35 }}>↕</span>;
    return <span style={{ marginLeft: '0.3rem' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const markRead = (id) => {
    setReadIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveSet(READ_STORAGE_KEY, next);
      return next;
    });
  };

  const setStatus = (id, status) => {
    setStatuses(prev => {
      const next = { ...prev, [id]: status };
      saveStatuses(next);
      return next;
    });
  };

  const archiveResponse = (id) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveSet(ARCHIVED_STORAGE_KEY, next);
      return next;
    });
  };

  const unarchiveResponse = (id) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      saveSet(ARCHIVED_STORAGE_KEY, next);
      return next;
    });
  };

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
          setResponses((data.responses || []).map(cleanResponse));
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const activeResponses = responses.filter(r => !archivedIds.has(r.id));
  const archivedResponses = responses.filter(r => archivedIds.has(r.id));

  const renderRow = (response, isArchiveList = false) => {
    const snippet = response.snippet || response.body || '';
    const senderName = response.person_name || response.from || '(unknown)';
    const dateStr = response.date || response.received_at;
    const isUnread = !readIds.has(response.id);
    const status = statuses[response.id] || null;
    const isNotInterested = status === 'not_interested';

    return (
      <tr
        key={response.id}
        className={`reply-row${isUnread && !isArchiveList ? ' reply-unread' : ''}`}
        onClick={() => { setSelected(response); markRead(response.id); }}
      >
        <td className="reply-sender">
          {isUnread && !isArchiveList && <span className="unread-dot" />}
          {senderName}
        </td>
        <td className="reply-lead">{response.lead_title || '—'}</td>
        <td className="reply-preview">{snippet.substring(0, 100) || '(no text)'}</td>
        <td className="reply-date" title={new Date(dateStr).toLocaleString()}>{formatTimeAgo(dateStr)}</td>
        <td className="reply-status-cell" onClick={e => e.stopPropagation()}>
          <div className="reply-status-cell-inner">
            <select
              className={`status-select${status ? ` ${STATUS_COLORS[status]}` : ''}`}
              value={status || ''}
              onChange={e => setStatus(response.id, e.target.value)}
            >
              <option value="">—</option>
              <option value="followed_up">Followed up</option>
              <option value="not_interested">Not interested</option>
            </select>
            {!isArchiveList && (
              <button className="archive-btn" onClick={() => archiveResponse(response.id)}>archive</button>
            )}
            {isArchiveList && (
              <button className="unarchive-btn" onClick={() => unarchiveResponse(response.id)}>Restore</button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="response-monitor">
      <div className="section-header">
        <h2>Response Monitor</h2>
        <p>Track incoming replies from your email campaigns</p>
      </div>
      <p className="response-meta">
        {activeResponses.length} repl{activeResponses.length === 1 ? 'y' : 'ies'}
        {(() => { const u = activeResponses.filter(r => !readIds.has(r.id)).length; return u > 0 ? <span className="unread-badge">{u} new</span> : null; })()}
        {' · '}auto-refreshes every 10s
        {lastUpdated && <span> · last updated {lastUpdated.toLocaleTimeString()}</span>}
      </p>

      {responses.length > 0 && (() => {
        const now = Date.now();
        const today = activeResponses.filter(r => now - new Date(r.date || r.received_at) < 86400000).length;
        const thisWeek = activeResponses.filter(r => now - new Date(r.date || r.received_at) < 7 * 86400000).length;
        const unread = activeResponses.filter(r => !readIds.has(r.id)).length;
        return (
          <div className="response-stats">
            <div className="stat-item"><span className="stat-value">{unread}</span><span className="stat-label">unread</span></div>
            <div className="stat-divider" />
            <div className="stat-item"><span className="stat-value">{today}</span><span className="stat-label">today</span></div>
            <div className="stat-divider" />
            <div className="stat-item"><span className="stat-value">{thisWeek}</span><span className="stat-label">this week</span></div>
            <div className="stat-divider" />
            <div className="stat-item"><span className="stat-value">{activeResponses.length}</span><span className="stat-label">total</span></div>
          </div>
        );
      })()}

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
        ) : activeResponses.length === 0 && archivedResponses.length === 0 ? (
          <div className="empty-responses">
            <p>No replies yet. Make sure your n8n IMAP workflow is active.</p>
          </div>
        ) : (
          <table className="replies-table">
            <thead>
              <tr>
                <th className="th-sortable" onClick={() => toggleSort('sender')}>Sender{sortIcon('sender')}</th>
                <th>Lead</th>
                <th>Reply</th>
                <th className="th-sortable" onClick={() => toggleSort('received')}>Received{sortIcon('received')}</th>
                <th className="th-sortable" onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const STATUS_ORDER = { '': 0, followed_up: 1, not_interested: 2 };
                let rows = activeResponses.filter(r => {
                  const name = (r.person_name || r.from || '').toLowerCase();
                  return !filterSender || name.includes(filterSender.toLowerCase());
                });
                if (sort.col) {
                  rows = [...rows].sort((a, b) => {
                    let av, bv;
                    if (sort.col === 'sender') {
                      av = (a.person_name || a.from || '').toLowerCase();
                      bv = (b.person_name || b.from || '').toLowerCase();
                    } else if (sort.col === 'received') {
                      av = new Date(a.date || a.received_at).getTime();
                      bv = new Date(b.date || b.received_at).getTime();
                    } else if (sort.col === 'status') {
                      av = STATUS_ORDER[statuses[a.id] || ''] ?? 0;
                      bv = STATUS_ORDER[statuses[b.id] || ''] ?? 0;
                    }
                    return sort.dir === 'asc' ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
                  });
                }
                return rows.map(r => renderRow(r));
              })()}
            </tbody>
          </table>
        )}
      </div>

      {archivedResponses.length > 0 && (
        <div className="archived-section">
          <button className="archived-toggle" onClick={() => setShowArchived(p => !p)}>
            {showArchived ? '▾' : '▸'} Archived ({archivedResponses.length})
          </button>
          {showArchived && (
            <table className="replies-table archived-table">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Lead</th>
                  <th>Reply</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {archivedResponses.map(r => renderRow(r, true))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
