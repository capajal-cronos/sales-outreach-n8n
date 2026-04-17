import { useState, useEffect, useRef } from 'react';
import './LeadManagement.css';
import './EmailCampaign.css';

const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook/send-leads-mails';
const EXCLUDED_LABELS = ['answered', 'last_mail', 'last mail'];

const DEFAULT_EMAIL_PROMPT = `Write a personalized cold email.

Sender:
Name: {sender_name}
Company: Cronos

Lead data:
First name: {first_name}
Last name: {last_name}
Company: {company_name}
Website summary: {company_summary}

Email stage: {email_stage}

Write the email appropriate for this stage:
- first_mail → intro
- second_mail → follow-up
- third_mail → bump
- last_mail → final goodbye`;

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return hours <= 0 ? 'just now' : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function LeadManagement({ workflowData, updateWorkflowData, onNext, onPrevious, campaignPendingLeads = {}, onCampaignStarted, onCampaignDecided, workflowErrors = [], onDismissError }) {
  const [leads, setLeads] = useState(workflowData.leads || []);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState((workflowData.leads || []).length === 0);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [labelMapping, setLabelMapping] = useState({});
  const [pendingEmails, setPendingEmails] = useState([]);
  const [editingEmail, setEditingEmail] = useState(null); // { ...email, editSubject, editBody }
  const [emailPrompt, setEmailPrompt] = useState(DEFAULT_EMAIL_PROMPT);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [cooldownDays, setCooldownDays] = useState('');
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
  const isAnswered = (lead) => (lead.label || '').toLowerCase() === 'answered';
  const isLastMail = (lead) => ['last_mail', 'last mail'].includes((lead.label || '').toLowerCase());

  const isCoolingDown = (lead) => {
    const days = parseInt(cooldownDays) || 0;
    if (days <= 0) return false;
    if (isExcluded(lead)) return false;
    if (!lead.label || lead.label === 'no_label') return false;
    if (!lead.updatedAt) return false;
    const daysSinceContact = (Date.now() - new Date(lead.updatedAt).getTime()) / 86400000;
    return daysSinceContact < days;
  };

  const sortOrder = (lead) => isLastMail(lead) ? 2 : isAnswered(lead) ? 1 : 0;

  const filteredLeads = (filter === 'all'
    ? leads
    : leads.filter(l => (l.label_ids || []).some(id => String(id) === filter))
  ).toSorted((a, b) => sortOrder(a) - sortOrder(b));

  const eligibleLeads = leads.filter(l => !isExcluded(l) && !isCoolingDown(l));

  const handleSelectLead = (id) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    const selectable = filteredLeads.filter(l => !isExcluded(l) && !isCoolingDown(l) && !(l.id in campaignPendingLeads)).map(l => l.id);
    setSelectedLeads(prev => prev.length === selectable.length ? [] : selectable);
  };

  const sendToCampaign = async (leadsToSend) => {
    setIsSending(true);
    setActionResult(null);
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual', timestamp: new Date().toISOString(), leads: leadsToSend, totalLeads: leadsToSend.length, prompt: emailPrompt })
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
    try {
      const res = await fetch('http://localhost:3001/api/emails/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: email.lead_id, decision: 'approve', email_data: email })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to approve email: ${data.error || res.status}`);
        return;
      }
      setPendingEmails(prev => prev.filter(e => e.id !== emailId));
      onCampaignDecided?.([email.lead_id]);
    } catch (err) {
      alert(`Network error while approving email: ${err.message}`);
    }
    fetchPendingEmails();
  };

  const handleDeclineEmail = (emailId) => {
    const email = pendingEmails.find(e => e.id === emailId);
    if (!email) return;
    setEditingEmail({ ...email, editSubject: email.subject, editBody: email.body });
  };

  const handleSendEdited = async () => {
    if (!editingEmail) return;
    const email = editingEmail;
    try {
      const res = await fetch('http://localhost:3001/api/emails/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: email.lead_id,
          decision: 'approve',
          email_data: { ...email, subject: email.editSubject, body: email.editBody }
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to send edited email: ${data.error || res.status}`);
        return;
      }
      setEditingEmail(null);
      setPendingEmails(prev => prev.filter(e => e.id !== email.id));
      onCampaignDecided?.([email.lead_id]);
    } catch (err) {
      alert(`Network error while sending email: ${err.message}`);
    }
    fetchPendingEmails();
  };

  const handleDiscardEmail = async () => {
    if (!editingEmail) return;
    const email = editingEmail;
    setEditingEmail(null);
    setPendingEmails(prev => prev.filter(e => e.id !== email.id));
    onCampaignDecided?.([email.lead_id]);
    await fetch('http://localhost:3001/api/emails/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: email.lead_id, decision: 'decline', email_data: email })
    });
    fetchPendingEmails();
  };



  const pendingCount = Object.keys(campaignPendingLeads).length;
  const selectableInView = filteredLeads.filter(l => !isExcluded(l) && !isCoolingDown(l) && !(l.id in campaignPendingLeads));
  const allSelected = selectableInView.length > 0 && selectableInView.every(l => selectedLeads.includes(l.id));

  return (
    <div className="lead-management">
      <div className="section-header">
        <h2>Leads & Campaign</h2>
        <p>Select leads to run a campaign, then review and approve generated emails below</p>
      </div>

      {workflowErrors.length > 0 && (
        <div className="workflow-errors-container">
          {workflowErrors.map(err => (
            <div key={err.id} className="workflow-error-banner">
              <div className="workflow-error-content">
                <span className="workflow-error-label">{err.workflow}</span>
                <span className="workflow-error-message">{err.message}</span>
                {err.details && <span className="workflow-error-details">{err.details}</span>}
              </div>
              <button className="workflow-error-dismiss" onClick={() => onDismissError(err.id)} title="Dismiss">✕</button>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="empty-state"><p>Loading leads...</p></div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <p>No leads found.</p>
          <button className="btn btn-primary" onClick={fetchLeads}>Refresh</button>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="leads-controls">
            <div className="filter-section">
              <label>Filter:</label>
              <select value={filter} onChange={e => setFilter(e.target.value)} className="select-input">
                <option value="all">All ({leads.length})</option>
                {Object.entries(labelMapping)
                  .filter(([, name]) => !['hot', 'warm', 'cold'].includes(name.toLowerCase()))
                  .map(([id, name]) => {
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
                {isSending ? 'Sending...' : `Campaign (${selectedLeads.length} selected)`}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleStartForAll}
                disabled={isSending || eligibleLeads.filter(l => !(l.id in campaignPendingLeads)).length === 0}
              >
                Campaign for all ({eligibleLeads.length})
              </button>
            </div>
          </div>

          {/* Campaign Settings */}
          <div className="prompt-editor-section">
            <button className="btn-link prompt-toggle" onClick={() => setShowPromptEditor(prev => !prev)}>
              {showPromptEditor ? '▾ Hide Campaign Settings' : '▸ Campaign Settings'}
            </button>
            {showPromptEditor && (
              <div className="campaign-settings-card">
                <div className="campaign-setting-group">
                  <div className="campaign-setting-header">
                    <label className="campaign-setting-label">Cooldown between emails</label>
                    <span className="campaign-setting-hint">Minimum days before a lead can be emailed again</span>
                  </div>
                  <div className="cooldown-control">
                    <button className="cooldown-btn" onClick={() => setCooldownDays(String(Math.max(0, (parseInt(cooldownDays) || 0) - 1)))} disabled={(parseInt(cooldownDays) || 0) <= 0}>-</button>
                    <span className="cooldown-value">{parseInt(cooldownDays) || 0}</span>
                    <button className="cooldown-btn" onClick={() => setCooldownDays(String(Math.min(14, (parseInt(cooldownDays) || 0) + 1)))} disabled={(parseInt(cooldownDays) || 0) >= 14}>+</button>
                    <span className="cooldown-unit">days</span>
                  </div>
                </div>
                <div className="campaign-settings-divider" />
                <div className="campaign-setting-group">
                  <div className="campaign-setting-header">
                    <label className="campaign-setting-label">Email prompt</label>
                    <span className="campaign-setting-hint">Template used by AI to generate outreach emails</span>
                  </div>
                  <textarea
                    className="prompt-textarea"
                    value={emailPrompt}
                    onChange={e => setEmailPrompt(e.target.value)}
                    rows={14}
                    spellCheck={false}
                  />
                  <div className="prompt-editor-footer">
                    <small className="prompt-placeholders">
                      {'Placeholders: {sender_name}, {first_name}, {last_name}, {company_name}, {company_summary}, {email_stage}'}
                    </small>
                    <button className="btn-link" onClick={() => setEmailPrompt(DEFAULT_EMAIL_PROMPT)}>Reset to default</button>
                  </div>
                </div>
              </div>
            )}
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
                  const coolingDown = isCoolingDown(lead);
                  const disabled = isPending || excluded || coolingDown;

                  let disabledTitle;
                  if (excluded) disabledTitle = 'Cannot campaign: answered or last mail stage';
                  else if (coolingDown) {
                    const daysAgo = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86400000);
                    disabledTitle = `Cooldown: contacted ${daysAgo}d ago, need ${parseInt(cooldownDays)}d between emails`;
                  }

                  return (
                    <tr
                      key={lead.id}
                      className={`${selectedLeads.includes(lead.id) ? 'selected' : ''}${isAnswered(lead) ? ' excluded-answered' : ''}${isLastMail(lead) ? ' excluded-lastmail' : ''}${coolingDown ? ' cooling-down' : ''}`}
                      style={isPending ? { opacity: 0.4, pointerEvents: 'none', backgroundColor: '#f0f0f0' } : { cursor: disabled ? 'not-allowed' : 'pointer' }}
                      onClick={() => !disabled && handleSelectLead(lead.id)}
                      title={disabledTitle}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => handleSelectLead(lead.id)}
                          disabled={disabled}
                          title={disabledTitle}
                        />
                      </td>
                      <td>
                        <strong>{lead.title || '-'}</strong>
                        {isPending && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>in campaign…</span>}
                      </td>
                      <td>{lead.organization || '-'}</td>
                      <td>{lead.email || '-'}</td>
                      <td>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: 4, backgroundColor: labelName !== 'No Label' ? '#e0e7ff' : 'transparent', fontSize: '0.85rem' }}>
                          {labelName}
                        </span>
                      </td>
                      <td>{(!lead.label || lead.label === 'no_label') ? 'Not contacted yet' : timeAgo(lead.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <hr className="leads-section-divider" />

          {/* Processing indicator — show while more leads are pending than there are emails ready */}
          {pendingCount > pendingEmails.length && (
            <div className="processing-indicator" style={{ marginTop: '2rem' }}>
              <div className="spinner"></div>
              <p>AI is generating emails ({pendingEmails.length} ready, {pendingCount - pendingEmails.length} in progress)…</p>
            </div>
          )}

          {/* Pending emails */}
          {pendingEmails.length > 0 && (
            <div className="pending-emails-container" style={{ marginTop: '2rem' }}>
              <div className="pending-header">
                <h3>Pending Emails ({pendingEmails.length})</h3>
                <p>Review and approve before sending</p>
              </div>
              <div className="emails-list">
                {pendingEmails.map(email => {
                  const isEditing = editingEmail?.id === email.id;
                  return (
                    <div key={email.id} className={`email-card pending${isEditing ? ' editing' : ''}`}>
                      <div className="email-header">
                        <span className="email-stage">{email.email_stage}</span>
                        <span className="email-time">{new Date(email.created_at).toLocaleString()}</span>
                      </div>
                      <div className="email-details">
                        <p><strong>To:</strong> {email.first_name} ({email.email})</p>
                        {isEditing ? (
                          <>
                            <div className="email-edit-field">
                              <label><strong>Subject:</strong></label>
                              <input
                                type="text"
                                className="email-edit-input"
                                value={editingEmail.editSubject}
                                onChange={e => setEditingEmail(prev => ({ ...prev, editSubject: e.target.value }))}
                              />
                            </div>
                            <div className="email-edit-field">
                              <label><strong>Body:</strong></label>
                              <textarea
                                className="email-edit-textarea"
                                value={editingEmail.editBody}
                                onChange={e => setEditingEmail(prev => ({ ...prev, editBody: e.target.value }))}
                                rows={14}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <p><strong>Subject:</strong> {email.subject}</p>
                            <div className="email-body">
                              <strong>Body:</strong>
                              <pre>{email.body}</pre>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="email-actions">
                        {isEditing ? (
                          <>
                            <button className="btn btn-success" onClick={handleSendEdited}>Send Edited Version</button>
                            <button className="btn btn-danger" onClick={handleDiscardEmail}>Discard</button>
                            <button className="btn btn-secondary" onClick={() => setEditingEmail(null)}>← Back</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-success" onClick={() => handleApproveEmail(email.id)}>Approve & Send</button>
                            <button className="btn btn-warning" onClick={() => handleDeclineEmail(email.id)}>Edit / Decline</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingCount === 0 && pendingEmails.length === 0 && !actionResult && (
            <div className="empty-campaign-state">
              <p className="empty-campaign-title">No emails queued yet</p>
              <p className="empty-campaign-desc">Start a campaign to generate emails for review</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default LeadManagement;
