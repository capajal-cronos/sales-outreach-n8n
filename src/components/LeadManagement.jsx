import { useState, useEffect } from 'react';
import './LeadManagement.css';

function LeadManagement({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [labelMapping, setLabelMapping] = useState({});

  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Fetch label mappings and leads from Pipedrive on component mount
  useEffect(() => {
    fetchLabelMapping();
    fetchLeads();
  }, []);

  const fetchLabelMapping = async () => {
    try {
      const response = await fetch(
        `https://api.pipedrive.com/v1/leadLabels?api_token=${PIPEDRIVE_API_KEY}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Create a mapping of label ID to label name
          const mapping = {};
          data.data.forEach(label => {
            mapping[label.id] = label.name;
          });
          setLabelMapping(mapping);
          console.log('Label mapping loaded:', mapping);
        }
      }
    } catch (error) {
      console.error('Error fetching label mapping:', error);
    }
  };

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      // Fetch leads directly from Pipedrive API
      const response = await fetch(
        `https://api.pipedrive.com/v1/leads?api_token=${PIPEDRIVE_API_KEY}&limit=500`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          console.log(`Fetching details for ${data.data.length} leads...`);
          
          // Fetch detailed info sequentially with delay to avoid rate limits
          const detailedLeads = [];
          for (let index = 0; index < data.data.length; index++) {
            const lead = data.data[index];
            
            try {
              // Add delay between requests (150ms = ~6 requests/second)
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, 150));
              }
              
              const detailResponse = await fetch(
                `https://api.pipedrive.com/v1/leads/${lead.id}?api_token=${PIPEDRIVE_API_KEY}`
              );
              
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (detailData.success && detailData.data) {
                  const leadData = detailData.data;
                  
                  // Fetch organization name if we have an organization_id
                  if (leadData.organization_id && typeof leadData.organization_id === 'number') {
                    try {
                      await new Promise(resolve => setTimeout(resolve, 150));
                      const orgResponse = await fetch(
                        `https://api.pipedrive.com/v1/organizations/${leadData.organization_id}?api_token=${PIPEDRIVE_API_KEY}`
                      );
                      if (orgResponse.ok) {
                        const orgData = await orgResponse.json();
                        if (orgData.success && orgData.data) {
                          leadData.organization_name = orgData.data.name;
                        }
                      }
                    } catch (err) {
                      console.error(`Failed to fetch org ${leadData.organization_id}:`, err);
                    }
                  }
                  
                  // Fetch person email if we have a person_id
                  if (leadData.person_id && typeof leadData.person_id === 'number') {
                    try {
                      await new Promise(resolve => setTimeout(resolve, 150));
                      const personResponse = await fetch(
                        `https://api.pipedrive.com/v1/persons/${leadData.person_id}?api_token=${PIPEDRIVE_API_KEY}`
                      );
                      if (personResponse.ok) {
                        const personData = await personResponse.json();
                        if (personData.success && personData.data) {
                          leadData.person_email = personData.data.email?.[0]?.value || personData.data.email;
                        }
                      }
                    } catch (err) {
                      console.error(`Failed to fetch person ${leadData.person_id}:`, err);
                    }
                  }
                  
                  detailedLeads.push(leadData);
                } else {
                  detailedLeads.push(lead);
                }
              } else {
                console.error(`Failed to fetch lead ${lead.id}:`, detailResponse.status);
                detailedLeads.push(lead);
              }
            } catch (err) {
              console.error(`Failed to fetch details for lead ${lead.id}:`, err);
              detailedLeads.push(lead);
            }
            
            // Update progress
            if ((index + 1) % 5 === 0) {
              console.log(`Progress: ${index + 1}/${data.data.length} leads processed`);
            }
          }
          
          console.log('Finished fetching all lead details');
          setLeads(detailedLeads);
          updateWorkflowData('leads', detailedLeads);
        }
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      // If API fails, use workflow data as fallback
      setLeads(workflowData.leads || []);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLabelChange = async (leadId, newLabelId) => {
    try {
      // Update label in Pipedrive
      const response = await fetch(
        `https://api.pipedrive.com/v1/leads/${leadId}?api_token=${PIPEDRIVE_API_KEY}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label_ids: [newLabelId]
          })
        }
      );

      if (response.ok) {
        // Update local state
        const updatedLeads = leads.map(lead =>
          lead.id === leadId ? { ...lead, label_ids: [newLabelId] } : lead
        );
        setLeads(updatedLeads);
        updateWorkflowData('leads', updatedLeads);
      } else {
        console.error('Failed to update label in Pipedrive');
        alert('Failed to update label');
      }
    } catch (error) {
      console.error('Error updating label:', error);
      alert(`Failed to update label: ${error.message}`);
    }
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
    : leads.filter(lead => {
        const leadLabelIds = lead.label_ids || [];
        return leadLabelIds.includes(filter);
      });

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
                    {Object.entries(labelMapping).map(([labelId, labelName]) => {
                      const count = leads.filter(l => l.label_ids && l.label_ids.includes(labelId)).length;
                      return (
                        <option key={labelId} value={labelId}>
                          {labelName} ({count})
                        </option>
                      );
                    })}
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
                    {filteredLeads.map(lead => {
                      // Get label names from label_ids
                      const labelNames = lead.label_ids && lead.label_ids.length > 0
                        ? lead.label_ids.map(id => labelMapping[id] || id).join(', ')
                        : 'No Label';
                      
                      // Use the fetched organization name
                      const orgName = lead.organization_name || lead.organization?.name || '-';
                      
                      // Use the fetched person email
                      const email = lead.person_email || lead.email || '-';
                      
                      return (
                        <tr key={lead.id} className={selectedLeads.includes(lead.id) ? 'selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedLeads.includes(lead.id)}
                              onChange={() => handleSelectLead(lead.id)}
                            />
                          </td>
                          <td><strong>{lead.title || '-'}</strong></td>
                          <td>{orgName}</td>
                          <td>
                            {email !== '-' ? (
                              <a href={`mailto:${email}`}>{email}</a>
                            ) : '-'}
                          </td>
                          <td>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: labelNames !== 'No Label' ? '#e0e7ff' : 'transparent',
                              fontSize: '0.875rem'
                            }}>
                              {labelNames}
                            </span>
                          </td>
                          <td>{lead.add_time ? new Date(lead.add_time).toLocaleDateString() : '-'}</td>
                        </tr>
                      );
                    })}
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