import { useState } from 'react';
import './LeadManagement.css';

function LeadManagement({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [leads, setLeads] = useState(workflowData.leads || []);
  const [filter, setFilter] = useState('all');
  const [isCreatingLeads, setIsCreatingLeads] = useState(false);

  const leadStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

  const handleCreateLeads = async () => {
    if (workflowData.people.length === 0) {
      alert('No people found. Please go back and find people first.');
      return;
    }

    setIsCreatingLeads(true);

    // Simulate creating leads in Pipedrive
    setTimeout(() => {
      const newLeads = workflowData.people.map(person => ({
        id: `lead-${person.id}`,
        personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        email: person.email,
        phone: person.phone,
        title: person.title,
        organization: person.organization,
        organizationId: person.organizationId,
        status: 'new',
        value: Math.floor(Math.random() * 50000) + 10000,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: '',
        createdAt: new Date().toISOString(),
        lastContactedAt: null
      }));

      setLeads(newLeads);
      updateWorkflowData('leads', newLeads);
      setIsCreatingLeads(false);
      alert(`${newLeads.length} leads created in Pipedrive!`);
    }, 1500);
  };

  const handleStatusChange = (leadId, newStatus) => {
    const updatedLeads = leads.map(lead =>
      lead.id === leadId ? { ...lead, status: newStatus } : lead
    );
    setLeads(updatedLeads);
    updateWorkflowData('leads', updatedLeads);
  };

  const handleNotesChange = (leadId, notes) => {
    const updatedLeads = leads.map(lead =>
      lead.id === leadId ? { ...lead, notes } : lead
    );
    setLeads(updatedLeads);
    updateWorkflowData('leads', updatedLeads);
  };

  const handleDeleteLead = (leadId) => {
    if (confirm('Are you sure you want to delete this lead?')) {
      const updatedLeads = leads.filter(lead => lead.id !== leadId);
      setLeads(updatedLeads);
      updateWorkflowData('leads', updatedLeads);
    }
  };

  const filteredLeads = filter === 'all' 
    ? leads 
    : leads.filter(lead => lead.status === filter);

  const getStatusColor = (status) => {
    const colors = {
      new: '#3b82f6',
      contacted: '#8b5cf6',
      qualified: '#06b6d4',
      proposal: '#f59e0b',
      negotiation: '#f97316',
      won: '#10b981',
      lost: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const getLeadStats = () => {
    return {
      total: leads.length,
      new: leads.filter(l => l.status === 'new').length,
      contacted: leads.filter(l => l.status === 'contacted').length,
      qualified: leads.filter(l => l.status === 'qualified').length,
      won: leads.filter(l => l.status === 'won').length,
      totalValue: leads.reduce((sum, lead) => sum + lead.value, 0)
    };
  };

  const stats = getLeadStats();

  return (
    <div className="lead-management">
      <div className="section-header">
        <h2>📊 Lead Management</h2>
        <p>Manage leads created in Pipedrive</p>
      </div>

      {workflowData.people.length === 0 ? (
        <div className="empty-state">
          <p>⚠️ No people found. Please go back and find people first.</p>
          <button className="btn btn-secondary" onClick={onPrevious}>
            ← Back to People Finder
          </button>
        </div>
      ) : (
        <>
          {leads.length === 0 ? (
            <div className="create-leads-section">
              <div className="info-box">
                <h3>Ready to Create Leads</h3>
                <p>You have {workflowData.people.length} people ready to be converted into leads in Pipedrive.</p>
                <button 
                  className="btn btn-primary btn-large"
                  onClick={handleCreateLeads}
                  disabled={isCreatingLeads}
                >
                  {isCreatingLeads ? '⏳ Creating Leads...' : '✨ Create Leads in Pipedrive'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{stats.total}</div>
                  <div className="stat-label">Total Leads</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.new}</div>
                  <div className="stat-label">New</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.contacted}</div>
                  <div className="stat-label">Contacted</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.qualified}</div>
                  <div className="stat-label">Qualified</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.won}</div>
                  <div className="stat-label">Won</div>
                </div>
                <div className="stat-card highlight">
                  <div className="stat-value">${(stats.totalValue / 1000).toFixed(0)}K</div>
                  <div className="stat-label">Total Value</div>
                </div>
              </div>

              <div className="leads-controls">
                <div className="filter-section">
                  <label>Filter by Status:</label>
                  <select 
                    value={filter} 
                    onChange={(e) => setFilter(e.target.value)}
                    className="select-input"
                  >
                    <option value="all">All Leads ({leads.length})</option>
                    {leadStatuses.map(status => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)} ({leads.filter(l => l.status === status).length})
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  className="btn btn-success"
                  onClick={onNext}
                  disabled={leads.filter(l => l.status === 'new' || l.status === 'contacted').length === 0}
                >
                  📧 Continue to Email Campaign
                </button>
              </div>

              <div className="leads-list">
                {filteredLeads.map(lead => (
                  <div key={lead.id} className="lead-card">
                    <div className="lead-header">
                      <div className="lead-info">
                        <h4>{lead.personName}</h4>
                        <p className="lead-title">{lead.title} at {lead.organization}</p>
                      </div>
                      <div className="lead-value">${(lead.value / 1000).toFixed(1)}K</div>
                    </div>

                    <div className="lead-body">
                      <div className="lead-details">
                        <p><strong>📧 Email:</strong> <a href={`mailto:${lead.email}`}>{lead.email}</a></p>
                        <p><strong>📞 Phone:</strong> {lead.phone}</p>
                        <p><strong>📅 Expected Close:</strong> {lead.expectedCloseDate}</p>
                        <p><strong>🕐 Created:</strong> {new Date(lead.createdAt).toLocaleDateString()}</p>
                      </div>

                      <div className="lead-status-section">
                        <label>Status:</label>
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          className="status-select"
                          style={{ borderColor: getStatusColor(lead.status) }}
                        >
                          {leadStatuses.map(status => (
                            <option key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="lead-notes">
                        <label>Notes:</label>
                        <textarea
                          value={lead.notes}
                          onChange={(e) => handleNotesChange(lead.id, e.target.value)}
                          placeholder="Add notes about this lead..."
                          rows="2"
                        />
                      </div>
                    </div>

                    <div className="lead-actions">
                      <button 
                        className="btn-icon btn-danger"
                        onClick={() => handleDeleteLead(lead.id)}
                        title="Delete Lead"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="navigation-buttons">
            <button className="btn btn-secondary" onClick={onPrevious}>
              ← Previous
            </button>
          </div>

          <div className="webhook-info">
            <h4>🔗 n8n Webhook Integration</h4>
            <p>To automate lead creation, configure your n8n workflow with a webhook:</p>
            <code>POST /webhook/pipedrive-create-leads</code>
            <p>The webhook should accept people data and create leads in Pipedrive.</p>
          </div>
        </>
      )}
    </div>
  );
}

export default LeadManagement;