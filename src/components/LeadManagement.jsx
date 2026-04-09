import { useState, useEffect, useRef } from 'react';
import './LeadManagement.css';
import './EmailCampaign.css';

const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook/send-leads-mails';
const EXCLUDED_LABELS = ['answered', 'last_mail', 'last mail'];

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return hours <= 0 ? 'just now' : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function LeadManagement({ workflowData, updateWorkflowData, onNext, onPrevious, campaignPendingLeads = {}, onCampaignStarted, onCampaignDecided }) {
  const [leads, setLeads] = useState(workflowData.leads || []);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState((workflowData.leads || []).length === 0);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [labelMapping, setLabelMapping] = useState({});
  const [pendingEmails, setPendingEmails] = useState([]);
  const hasFetchedRef = useRef(false);

  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchLabelMapping();
    fetchLeads();
  }, []);

  useEffect(() => {
    fetchPendingEmails();
    const interval = setInterval(fetchPendingEmails, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLabelMapping = async () => {
    try {
      const res = await fetch(`https://api.pipedrive.com/v1/leadLabels?api_token=${PIPEDRIVE_API_KEY}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const mapping = {};
          data.data.forEach(l => { mapping[l.id] = l.name; });
          setLabelMapping(mapping);
        }
      }
    } catch (err) {
      console.error('Error fetching label mapping:', err);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/leads?showAll=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.leads) {
          // Merge: keep cached email/org if server returns empty (Pipedrive rate-limit can blank them)
          const cached = workflowData.leads || [];
          const merged = data.leads.map(lead => {
            const c = cached.find(x => x.id === lead.id);
            return {
              ...lead,
              email: lead.email || c?.email || '',
              organization: lead.organization || c?.organization || ''
            };
          });
          setLeads(merged);
          updateWorkflowData('leads', merged);
        }
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingEmails = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/email-queue/pending');
      if (res.ok) {
        const data = await res.json();
        setPendingEmails(data.emails || []);
      }
    } catch (err) {
      console.error('Error fetching pending emails:', err);
    }
  };

  const isExcluded = (lead) => EXCLUDED_LABELS.includes((lead.label || '').toLowerCase());

  const filteredLeads = filter === 'all'
    ? leads
    : leads.filter(l => (l.label_ids || []).includes(filter));

  const eligibleLeads = leads.filter(l => !isExcluded(l));

  const handleSelectLead = (id) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    const selectable = filteredLeads.filter(l => !isExcluded(l) && !(l.id in campaignPendingLeads)).map(l => l.id);
    setSelectedLeads(prev => prev.length === selectable.length ? [] : selectable);
  };

  const sendToCampaign = async (leadsToSend) => {
    setIsSending(true);
    setActionResult(null);
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual', timestamp: new Date().toISOString(), leads: leadsToSend, totalLeads: leadsToSend.length })
      });
      if (res.ok) {
        onCampaignStarted(leadsToSend.map(l => l.id));
        setSelectedLeads([]);
        setActionResult({ success: true, message: `Campaign started for ${leadsToSend.length} lead(s). Emails will appear below.` });
        setTimeout(fetchPendingEmails, 2000);
      } else {
        setActionResult({ success: false, message: `Failed: HTTP ${res.status}` });
      }
    } catch (err) {
      setActionResult({ success: false, message: `Failed: ${err.message}` });
    } finally {
      setIsSending(false);
    }
  };

  const handleStartForSelected = () => {
    const toSend = leads.filter(l => selectedLeads.includes(l.id));
    sendToCampaign(toSend);
  };

  const handleStartForAll = () => {
    const toSend = eligibleLeads.filter(l => !(l.id in campaignPendingLeads));
    sendToCampaign(toSend);
  };

  const handleApproveEmail = async (emailId) => {
    const email = pendingEmails.find(e => e.id === emailId);
    if (!email) return;
    setPendingEmails(prev => prev.filter(e => e.id !== emailId));
    onCampaignDecided?.([email.lead_id]);
    await fetch('http://localhost:3001/api/emails/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: email.lead_id, decision: 'approve', email_data: email })
    });
    fetchPendingEmails();
  };

  const handleDeclineEmail = async (emailId) => {
    const email = pendingEmails.find(e => e.id === emailId);
    if (!email) return;
    setPendingEmails(prev => prev.filter(e => e.id !== emailId));
    onCampaignDecided?.([email.lead_id]);
    await fetch('http://localhost:3001/api/emails/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: email.lead_id, decision: 'decline', email_data: email })
    });
    fetchPendingEmails();
  };

  const handleDeleteLeads = async () => {
    if (selectedLeads.length === 0) return;
    if (!confirm(`Delete ${selectedLeads.length} lead(s) from Pipedrive?`)) return;
    setIsDeleting(true);
    for (const id of selectedLeads) {
      await fetch(`https://api.pipedrive.com/v1/leads/${id}?api_token=${PIPEDRIVE_API_KEY}`, { method: 'DELETE' });
    }
    setSelectedLeads([]);
    await fetchLeads();
    setIsDeleting(false);
  };

  const pendingCount = Object.keys(campaignPendingLeads).length;
  const selectableInView = filteredLeads.filter(l => !isExcluded(l) && !(l.id in campaignPendingLeads));
  const allSelected = selectableInView.length > 0 && selectableInView.every(l => selectedLeads.includes(l.id));

  return (
    <div className="lead-management">
      <div className="section-header">
        <h2>📊 Leads & Campaign</h2>
        <p>Select leads to run a campaign, then review and approve generated emails below</p>
      </div>

      {isLoading ? (
        <div className="empty-state"><p>⏳ Loading leads...</p></div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <p>📭 No leads found.</p>
          <button className="btn btn-primary" onClick={fetchLeads}>🔄 Refresh</button>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="leads-controls">
            <div className="filter-section">
              <label>Filter:</label>
              <select value={filter} onChange={e => setFilter(e.target.value)} className="select-input">
                <option value="all">All ({leads.length})</option>
                {Object.entries(labelMapping).map(([id, name]) => {
                  const count = leads.filter(l => (l.label_ids || []).includes(id)).length;
                  return <option key={id} value={id}>{name} ({count})</option>;
                })}
              </select>
            </div>

            <div className="bulk-actions">
              <button
                className="btn btn-primary"
                onClick={handleStartForSelected}
                disabled={selectedLeads.length === 0 || isSending}
              >
                {isSending ? '⏳ Sending...' : `🚀 Campaign (${selectedLeads.length} selected)`}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleStartForAll}
                disabled={isSending || eligibleLeads.filter(l => !(l.id in campaignPendingLeads)).length === 0}
              >
                🚀 Campaign for all ({eligibleLeads.length})
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteLeads}
                disabled={selectedLeads.length === 0 || isDeleting}
              >
                {isDeleting ? '⏳' : `🗑️ Delete (${selectedLeads.length})`}
              </button>
            </div>
          </div>

          {actionResult && (
            <p style={{ fontSize: '0.875rem', color: actionResult.success ? 'var(--success-color)' : 'var(--error-color)', marginBottom: '1rem' }}>
              {actionResult.message}
            </p>
          )}

          {/* Leads table */}
          <div className="leads-table-container">
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allSelected} onChange={handleSelectAll} />
                  </th>
                  <th>Title</th>
                  <th>Organisation</th>
                  <th>Email</th>
                  <th>Label</th>
                  <th>Last Contacted</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => {
                  const labelName = lead.label && lead.label !== 'no_label'
                    ? lead.label
                    : (lead.label_ids || []).map(id => labelMapping[id] || id).join(', ') || 'No Label';
                  const isPending = lead.id in campaignPendingLeads;
                  const excluded = isExcluded(lead);
                  const disabled = isPending || excluded;

                  return (
                    <tr
                      key={lead.id}
                      className={selectedLeads.includes(lead.id) ? 'selected' : ''}
                      style={isPending ? { opacity: 0.4, pointerEvents: 'none', backgroundColor: '#f0f0f0' } : {}}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => handleSelectLead(lead.id)}
                          disabled={disabled}
                          title={excluded ? 'Cannot campaign: answered or last mail stage' : undefined}
                        />
                      </td>
                      <td>
                        <strong>{lead.title || '-'}</strong>
                        {isPending && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#888' }}>⏳ in campaign…</span>}
                      </td>
                      <td>{lead.organization || '-'}</td>
                      <td>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : '-'}</td>
                      <td>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: 4, backgroundColor: labelName !== 'No Label' ? '#e0e7ff' : 'transparent', fontSize: '0.85rem' }}>
                          {labelName}
                        </span>
                      </td>
                      <td>{timeAgo(lead.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Processing indicator — show while more leads are pending than there are emails ready */}
          {pendingCount > pendingEmails.length && (
            <div className="processing-indicator" style={{ marginTop: '2rem' }}>
              <div className="spinner"></div>
              <p>🤖 AI is generating emails ({pendingEmails.length} ready, {pendingCount - pendingEmails.length} in progress)…</p>
            </div>
          )}

          {/* Pending emails */}
          {pendingEmails.length > 0 && (
            <div className="pending-emails-container" style={{ marginTop: '2rem' }}>
              <div className="pending-header">
                <h3>📬 Pending Emails ({pendingEmails.length})</h3>
                <p>Review and approve before sending</p>
              </div>
              <div className="emails-list">
                {pendingEmails.map(email => (
                  <div key={email.id} className="email-card pending">
                    <div className="email-header">
                      <span className="email-stage">{email.email_stage}</span>
                      <span className="email-time">{new Date(email.created_at).toLocaleString()}</span>
                    </div>
                    <div className="email-details">
                      <p><strong>To:</strong> {email.first_name} ({email.email})</p>
                      <p><strong>Subject:</strong> {email.subject}</p>
                      <div className="email-body">
                        <strong>Body:</strong>
                        <pre>{email.body}</pre>
                      </div>
                    </div>
                    <div className="email-actions">
                      <button className="btn btn-success" onClick={() => handleApproveEmail(email.id)}>✅ Approve & Send</button>
                      <button className="btn btn-danger" onClick={() => handleDeclineEmail(email.id)}>❌ Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingCount === 0 && pendingEmails.length === 0 && !actionResult && (
            <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              📭 No pending emails. Select leads above and start a campaign.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default LeadManagement;
