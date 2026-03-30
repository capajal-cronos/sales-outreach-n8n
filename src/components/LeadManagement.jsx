import { useState, useEffect } from 'react';
import './LeadManagement.css';

function LeadManagement({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const leadLabels = ['no_label', 'first_mail', 'second_mail', 'third_mail', 'last_mail', 'answered'];
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Fetch leads from Pipedrive on component mount
  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual Pipedrive API call
      const response = await fetch('http://localhost:3001/api/leads');
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads || []);
        updateWorkflowData('leads', data.leads || []);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      // If API fails, use workflow data as fallback
      setLeads(workflowData.leads || []);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLabelChange = (leadId, newLabel) => {
    const updatedLeads = leads.map(lead =>
      lead.id === leadId ? { ...lead, label: newLabel } : lead
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

  const handleDeleteLeads = async () => {
    if (selectedLeads.length === 0) {
      alert('Please select leads to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedLeads.length} lead(s) from Pipedrive?`)) {
      return;
    }

    setIsDeleting(true);
    const errors = [];

    try {
      // Delete each selected lead from Pipedrive
      for (const leadId of selectedLeads) {
        try {
          const response = await fetch(
            `https://api.pipedrive.com/v1/leads/${leadId}?api_token=${PIPEDRIVE_API_KEY}`,
            { method: 'DELETE' }
          );

          if (!response.ok) {
            errors.push(`Lead ${leadId}: ${response.status}`);
          }
        } catch (error) {
          errors.push(`Lead ${leadId}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        console.error('Errors deleting leads:', errors);
        alert(`Some leads could not be deleted:\n${errors.join('\n')}`);
      } else {
        alert(`Successfully deleted ${selectedLeads.length} lead(s)`);
      }

      // Refresh the leads list
      setSelectedLeads([]);
      await fetchLeads();
    } catch (error) {
      console.error('Error deleting leads:', error);
      alert(`Failed to delete leads: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectLead = (leadId) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(lead => lead.id));
    }
  };

  const filteredLeads = filter === 'all'
    ? leads
    : leads.filter(lead => (lead.label || 'no_label') === filter);

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
      first_mail: leads.filter(l => l.label === 'first_mail').length,
      second_mail: leads.filter(l => l.label === 'second_mail').length,
      third_mail: leads.filter(l => l.label === 'third_mail').length,
      last_mail: leads.filter(l => l.label === 'last_mail').length,
      answered: leads.filter(l => l.label === 'answered').length
    };
  };

  const stats = getLeadStats();

  return (
    <div className="lead-management">
      <div className="section-header">
        <h2>📊 Lead Management</h2>
        <p>Manage leads created in Pipedrive</p>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <p>⏳ Loading leads from Pipedrive...</p>
        </div>
      ) : (
        <>
          {leads.length === 0 ? (
            <div className="empty-state">
              <p>📭 No leads found in Pipedrive.</p>
              <button className="btn btn-primary" onClick={fetchLeads}>
                🔄 Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="leads-controls">
                <div className="filter-section">
                  <label>Filter by Label:</label>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="select-input"
                  >
                    <option value="all">All Leads ({leads.length})</option>
                    {leadLabels.map(label => (
                      <option key={label} value={label}>
                        {label.replace(/_/g, ' ').charAt(0).toUpperCase() + label.replace(/_/g, ' ').slice(1)} ({leads.filter(l => (l.label || 'no_label') === label).length})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bulk-actions">
                  <button
                    className="btn btn-danger"
                    onClick={handleDeleteLeads}
                    disabled={selectedLeads.length === 0 || isDeleting}
                  >
                    {isDeleting ? '⏳ Deleting...' : `🗑️ Delete Selected (${selectedLeads.length})`}
                  </button>
                </div>
              </div>

              <div className="leads-table-container">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                          onChange={handleSelectAll}
                          title="Select all"
                        />
                      </th>
                      <th>Title</th>
                      <th>Organization</th>
                      <th>Email</th>
                      <th>Label</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead.id} className={selectedLeads.includes(lead.id) ? 'selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={() => handleSelectLead(lead.id)}
                          />
                        </td>
                        <td><strong>{lead.title || lead.personName || '-'}</strong></td>
                        <td>{lead.organization || lead.organization_name || '-'}</td>
                        <td>
                          {lead.email ? (
                            <a href={`mailto:${lead.email}`}>{lead.email}</a>
                          ) : '-'}
                        </td>
                        <td>
                          <select
                            value={lead.label || 'no_label'}
                            onChange={(e) => handleLabelChange(lead.id, e.target.value)}
                            className="status-select-compact"
                          >
                            {leadLabels.map(label => (
                              <option key={label} value={label}>
                                {label.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </>
      )}
    </div>
  );
}

export default LeadManagement;