import { useState } from 'react';
import './EmailCampaign.css';

function EmailCampaign({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [campaign, setCampaign] = useState({
    name: '',
    subject: '',
    emailBody: '',
    selectedLeads: [],
    sendSchedule: 'immediate',
    scheduledDate: '',
    followUpEnabled: false,
    followUpDays: 3
  });

  const [isSending, setIsSending] = useState(false);
  const [campaigns, setCampaigns] = useState(workflowData.campaigns || []);

  const emailTemplates = [
    {
      name: 'Cold Outreach',
      subject: 'Quick question about {{organization}}',
      body: `Hi {{firstName}},

I noticed you're the {{title}} at {{organization}}. I wanted to reach out because we help companies like yours [value proposition].

Would you be open to a quick 15-minute call next week to discuss how we might be able to help {{organization}}?

Best regards,
[Your Name]`
    },
    {
      name: 'Follow-up',
      subject: 'Following up on my previous email',
      body: `Hi {{firstName}},

I wanted to follow up on my previous email about [topic]. I understand you're busy, but I believe this could be valuable for {{organization}}.

Would you have 10 minutes this week for a quick chat?

Best regards,
[Your Name]`
    },
    {
      name: 'Value Proposition',
      subject: 'Helping {{organization}} achieve [specific goal]',
      body: `Hi {{firstName}},

I've been researching {{organization}} and noticed [specific observation]. We've helped similar companies in {{industry}} achieve [specific results].

I'd love to share how we could help {{organization}} achieve similar results. Are you available for a brief call?

Best regards,
[Your Name]`
    }
  ];

  const handleTemplateSelect = (template) => {
    setCampaign(prev => ({
      ...prev,
      subject: template.subject,
      emailBody: template.body
    }));
  };

  const handleLeadSelection = (leadId) => {
    setCampaign(prev => {
      const selected = prev.selectedLeads.includes(leadId)
        ? prev.selectedLeads.filter(id => id !== leadId)
        : [...prev.selectedLeads, leadId];
      return { ...prev, selectedLeads: selected };
    });
  };

  const selectAllLeads = () => {
    const eligibleLeads = workflowData.leads.filter(
      lead => lead.status === 'new' || lead.status === 'contacted'
    );
    setCampaign(prev => ({
      ...prev,
      selectedLeads: eligibleLeads.map(lead => lead.id)
    }));
  };

  const deselectAllLeads = () => {
    setCampaign(prev => ({
      ...prev,
      selectedLeads: []
    }));
  };

  const handleSendCampaign = async () => {
    if (!campaign.name || !campaign.subject || !campaign.emailBody) {
      alert('Please fill in campaign name, subject, and email body');
      return;
    }

    if (campaign.selectedLeads.length === 0) {
      alert('Please select at least one lead');
      return;
    }

    setIsSending(true);

    // Simulate sending emails via n8n
    setTimeout(() => {
      const newCampaign = {
        id: `campaign-${Date.now()}`,
        ...campaign,
        status: campaign.sendSchedule === 'immediate' ? 'sent' : 'scheduled',
        sentAt: campaign.sendSchedule === 'immediate' ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        emailsSent: campaign.selectedLeads.length,
        opensCount: 0,
        clicksCount: 0,
        repliesCount: 0
      };

      const updatedCampaigns = [...campaigns, newCampaign];
      setCampaigns(updatedCampaigns);
      updateWorkflowData('campaigns', updatedCampaigns);

      // Update lead statuses
      const updatedLeads = workflowData.leads.map(lead =>
        campaign.selectedLeads.includes(lead.id)
          ? { ...lead, status: 'contacted', lastContactedAt: new Date().toISOString() }
          : lead
      );
      updateWorkflowData('leads', updatedLeads);

      setIsSending(false);
      alert(`Campaign "${campaign.name}" ${campaign.sendSchedule === 'immediate' ? 'sent' : 'scheduled'} successfully!`);
      
      // Reset form
      setCampaign({
        name: '',
        subject: '',
        emailBody: '',
        selectedLeads: [],
        sendSchedule: 'immediate',
        scheduledDate: '',
        followUpEnabled: false,
        followUpDays: 3
      });
    }, 2000);
  };

  const getPreviewEmail = () => {
    if (campaign.selectedLeads.length === 0) return null;
    
    const lead = workflowData.leads.find(l => l.id === campaign.selectedLeads[0]);
    if (!lead) return null;

    const personData = workflowData.people.find(p => p.id === lead.personId);
    if (!personData) return null;

    let preview = campaign.emailBody
      .replace(/\{\{firstName\}\}/g, personData.firstName)
      .replace(/\{\{lastName\}\}/g, personData.lastName)
      .replace(/\{\{title\}\}/g, personData.title)
      .replace(/\{\{organization\}\}/g, personData.organization)
      .replace(/\{\{industry\}\}/g, 'Technology'); // Mock industry

    return preview;
  };

  const eligibleLeads = workflowData.leads.filter(
    lead => lead.status === 'new' || lead.status === 'contacted'
  );

  return (
    <div className="email-campaign">
      <div className="section-header">
        <h2>📧 Email Campaign</h2>
        <p>Create and send email campaigns to your leads</p>
      </div>

      {workflowData.leads.length === 0 ? (
        <div className="empty-state">
          <p>⚠️ No leads found. Please go back and create leads first.</p>
          <button className="btn btn-secondary" onClick={onPrevious}>
            ← Back to Lead Management
          </button>
        </div>
      ) : (
        <>
          <div className="campaign-form">
            <div className="form-section">
              <h3>Campaign Details</h3>
              <div className="form-group">
                <label>Campaign Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Q1 Outreach Campaign"
                  value={campaign.name}
                  onChange={(e) => setCampaign(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Email Templates</h3>
              <div className="template-grid">
                {emailTemplates.map((template, index) => (
                  <div key={index} className="template-card" onClick={() => handleTemplateSelect(template)}>
                    <h4>{template.name}</h4>
                    <p className="template-subject">{template.subject}</p>
                    <button className="btn btn-sm">Use Template</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Email Content</h3>
              <div className="form-group">
                <label>Subject Line *</label>
                <input
                  type="text"
                  placeholder="Email subject"
                  value={campaign.subject}
                  onChange={(e) => setCampaign(prev => ({ ...prev, subject: e.target.value }))}
                />
                <small>Use variables: {`{{firstName}}, {{lastName}}, {{title}}, {{organization}}`}</small>
              </div>

              <div className="form-group">
                <label>Email Body *</label>
                <textarea
                  rows="10"
                  placeholder="Email content..."
                  value={campaign.emailBody}
                  onChange={(e) => setCampaign(prev => ({ ...prev, emailBody: e.target.value }))}
                />
                <small>Use variables: {`{{firstName}}, {{lastName}}, {{title}}, {{organization}}`}</small>
              </div>
            </div>

            {campaign.emailBody && campaign.selectedLeads.length > 0 && (
              <div className="form-section">
                <h3>Email Preview</h3>
                <div className="email-preview">
                  <div className="preview-subject">
                    <strong>Subject:</strong> {campaign.subject.replace(/\{\{(\w+)\}\}/g, '[Variable]')}
                  </div>
                  <div className="preview-body">
                    {getPreviewEmail()}
                  </div>
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="section-header-with-actions">
                <h3>Select Recipients ({campaign.selectedLeads.length} selected)</h3>
                <div className="selection-actions">
                  <button className="btn-link" onClick={selectAllLeads}>
                    Select All
                  </button>
                  <button className="btn-link" onClick={deselectAllLeads}>
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="leads-selection">
                {eligibleLeads.map(lead => (
                  <label key={lead.id} className="lead-checkbox">
                    <input
                      type="checkbox"
                      checked={campaign.selectedLeads.includes(lead.id)}
                      onChange={() => handleLeadSelection(lead.id)}
                    />
                    <div className="lead-info">
                      <strong>{lead.personName}</strong>
                      <span className="lead-details">
                        {lead.title} at {lead.organization} • {lead.email}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Schedule</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    <input
                      type="radio"
                      value="immediate"
                      checked={campaign.sendSchedule === 'immediate'}
                      onChange={(e) => setCampaign(prev => ({ ...prev, sendSchedule: e.target.value }))}
                    />
                    Send Immediately
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="radio"
                      value="scheduled"
                      checked={campaign.sendSchedule === 'scheduled'}
                      onChange={(e) => setCampaign(prev => ({ ...prev, sendSchedule: e.target.value }))}
                    />
                    Schedule for Later
                  </label>
                  {campaign.sendSchedule === 'scheduled' && (
                    <input
                      type="datetime-local"
                      value={campaign.scheduledDate}
                      onChange={(e) => setCampaign(prev => ({ ...prev, scheduledDate: e.target.value }))}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Follow-up Settings</h3>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={campaign.followUpEnabled}
                  onChange={(e) => setCampaign(prev => ({ ...prev, followUpEnabled: e.target.checked }))}
                />
                Enable automatic follow-up
              </label>
              {campaign.followUpEnabled && (
                <div className="form-group">
                  <label>Follow-up after (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={campaign.followUpDays}
                    onChange={(e) => setCampaign(prev => ({ ...prev, followUpDays: parseInt(e.target.value) }))}
                  />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={handleSendCampaign}
                disabled={isSending || campaign.selectedLeads.length === 0}
              >
                {isSending ? '📤 Sending...' : `📧 ${campaign.sendSchedule === 'immediate' ? 'Send' : 'Schedule'} Campaign`}
              </button>
            </div>
          </div>

          {campaigns.length > 0 && (
            <div className="campaigns-history">
              <h3>Campaign History</h3>
              <div className="campaigns-list">
                {campaigns.map(camp => (
                  <div key={camp.id} className="campaign-card">
                    <div className="campaign-header">
                      <h4>{camp.name}</h4>
                      <span className={`status-badge ${camp.status}`}>{camp.status}</span>
                    </div>
                    <div className="campaign-stats">
                      <div className="stat">
                        <span className="stat-label">Sent:</span>
                        <span className="stat-value">{camp.emailsSent}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Opens:</span>
                        <span className="stat-value">{camp.opensCount}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Clicks:</span>
                        <span className="stat-value">{camp.clicksCount}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Replies:</span>
                        <span className="stat-value">{camp.repliesCount}</span>
                      </div>
                    </div>
                    <div className="campaign-date">
                      {camp.sentAt ? `Sent: ${new Date(camp.sentAt).toLocaleString()}` : `Created: ${new Date(camp.createdAt).toLocaleString()}`}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-success" onClick={onNext}>
                📊 Monitor Responses →
              </button>
            </div>
          )}

        </>
      )}
    </div>
  );
}

export default EmailCampaign;