import { useState, useEffect } from 'react';
import './PeopleFinder.css';

function PeopleFinder({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [searchParams, setSearchParams] = useState({
    selectedOrganizations: [],
    personTitles: [],
    personSeniorities: [],
    personDepartments: [],
    personLocations: [],
    verifiedEmailOnly: false,
    perPage: 25,
    maxPages: 4
  });

  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(workflowData.people || []);
  const [pipedrivePersons, setPipedrivePersons] = useState([]);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState([]);

  // Get Pipedrive API key from environment
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Fetch people and organizations from Pipedrive on mount
  useEffect(() => {
    fetchPipedrivePersons();
    fetchPipedriveOrganizations();
  }, []);

  const fetchPipedriveOrganizations = async () => {
    try {
      const response = await fetch(
        `https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Fetch detailed info for each organization to get Apollo ID and other fields
          const detailedOrgs = await Promise.all(
            data.data.map(async (org) => {
              try {
                const detailResponse = await fetch(
                  `https://api.pipedrive.com/v1/organizations/${org.id}?api_token=${PIPEDRIVE_API_KEY}`
                );
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  if (detailData.success && detailData.data) {
                    // Extract Apollo ID from custom field
                    const apolloId = detailData.data['596a7f23303e67be9328a9f09ce7f4979caf2c7f'];
                    return {
                      ...detailData.data,
                      apollo_id: apolloId
                    };
                  }
                  return detailData.success && detailData.data ? detailData.data : org;
                }
              } catch (err) {
                console.error(`Failed to fetch details for org ${org.id}:`, err);
              }
              return org;
            })
          );
          
          setPipedriveOrganizations(detailedOrgs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Pipedrive organizations:', err);
    }
  };

  const fetchPipedrivePersons = async () => {
    try {
      const response = await fetch(
        `https://api.pipedrive.com/v1/persons?api_token=${PIPEDRIVE_API_KEY}&limit=100`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setPipedrivePersons(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Pipedrive persons:', err);
    }
  };

  const seniorities = [
    'Entry',
    'Junior',
    'Senior',
    'Manager',
    'Director',
    'VP',
    'C-Level',
    'Owner'
  ];

  const departments = [
    'Sales',
    'Marketing',
    'Engineering',
    'Product',
    'Operations',
    'Finance',
    'Human Resources',
    'Customer Success',
    'IT',
    'Legal'
  ];

  const handleOrgSelection = (orgId) => {
    setSearchParams(prev => {
      const selected = prev.selectedOrganizations.includes(orgId)
        ? prev.selectedOrganizations.filter(id => id !== orgId)
        : [...prev.selectedOrganizations, orgId];
      return { ...prev, selectedOrganizations: selected };
    });
  };

  const handleMultiSelectChange = (field, value) => {
    setSearchParams(prev => {
      const currentValues = prev[field] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      return { ...prev, [field]: newValues };
    });
  };

  const handleInputChange = (field, value) => {
    setSearchParams(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = async () => {
    if (searchParams.selectedOrganizations.length === 0) {
      alert('Please select at least one organization');
      return;
    }

    setIsLoading(true);

    try {
      // Get Apollo IDs from selected organizations
      const selectedOrgs = pipedriveOrganizations.filter(org =>
        searchParams.selectedOrganizations.includes(org.id)
      );
      
      const apolloIds = selectedOrgs
        .map(org => org.apollo_id)
        .filter(id => id); // Filter out undefined/null values
      
      if (apolloIds.length === 0) {
        alert('Selected organizations do not have Apollo IDs. Please ensure organizations are synced with Apollo.');
        setIsLoading(false);
        return;
      }

      // Create mapping of Apollo ID to Pipedrive ID
      const orgMapping = {};
      selectedOrgs.forEach(org => {
        if (org.apollo_id) {
          orgMapping[org.apollo_id] = org.id; // Pipedrive ID
        }
      });

      console.log(`Searching for people in ${apolloIds.length} organizations with Apollo IDs`);
      console.log('Organization mapping:', orgMapping);

      // Fetch multiple pages
      const maxPages = searchParams.maxPages || 4;
      const perPage = searchParams.perPage || 25;
      let allPeople = [];

      for (let page = 1; page <= maxPages; page++) {
        console.log(`Fetching page ${page}/${maxPages}...`);

        // Build request body according to Apollo API format
        const requestBody = {
          organization_ids: apolloIds,
          pipedrive_org_mapping: orgMapping,
          page: page,
          per_page: perPage
        };

        // Add optional filters if provided
        if (searchParams.personTitles.length > 0) {
          requestBody.person_titles = searchParams.personTitles;
        }
        if (searchParams.personSeniorities.length > 0) {
          requestBody.person_seniorities = searchParams.personSeniorities;
        }
        if (searchParams.personDepartments.length > 0) {
          requestBody.person_departments = searchParams.personDepartments;
        }
        if (searchParams.personLocations.length > 0) {
          requestBody.person_locations = searchParams.personLocations;
        }
        if (searchParams.verifiedEmailOnly) {
          requestBody.contact_email_status = ["verified"];
        }

        console.log('Sending request body:', JSON.stringify(requestBody, null, 2));

        const response = await fetch('https://aigeneers.app.n8n.cloud/webhook-test/find-people', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`HTTP error on page ${page}! status: ${response.status}`);
          console.error('Error response:', errorText);
          break;
        }

        const data = await response.json();
        console.log('Raw response from n8n:', data);
        
        // Handle different response formats from Apollo
        let people = [];
        if (data.people && Array.isArray(data.people)) {
          people = data.people;
        } else if (data.success && data.data) {
          people = Array.isArray(data.data) ? data.data : [data.data];
        } else if (Array.isArray(data)) {
          people = data;
        }

        console.log(`Page ${page}: Received ${people.length} people`);
        console.log('Parsed people array:', people);

        if (people.length === 0) {
          console.log('No more results, stopping pagination');
          console.warn('⚠️ n8n returned 0 people. Check if your n8n workflow has a "Respond to Webhook" node that returns the people data.');
          break;
        }

        allPeople = allPeople.concat(people);

        // If we got fewer results than perPage, we've reached the end
        if (people.length < perPage) {
          console.log('Received fewer results than requested, stopping pagination');
          break;
        }
      }

      console.log(`Total: ${allPeople.length} people found`);
      
      setSearchResults(allPeople);
    } catch (error) {
      console.error('Error searching for people:', error);
      alert(`Failed to search for people: ${error.message}`);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToPipedrive = () => {
    updateWorkflowData('people', searchResults);
    alert(`${searchResults.length} people saved to workflow data. Ready to create leads!`);
    onNext();
  };

  const handleRemovePerson = (id) => {
    setSearchResults(prev => prev.filter(person => person.id !== id));
  };

  const selectAllOrganizations = () => {
    setSearchParams(prev => ({
      ...prev,
      selectedOrganizations: pipedriveOrganizations.map(org => org.id)
    }));
  };

  const deselectAllOrganizations = () => {
    setSearchParams(prev => ({
      ...prev,
      selectedOrganizations: []
    }));
  };

  return (
    <div className="people-finder">
      <div className="section-header">
        <h2>👥 Find People</h2>
        <p>Search for contacts within selected organizations or view existing people from Pipedrive</p>
      </div>

      {/* Pipedrive People */}
      {pipedrivePersons.length > 0 && (
        <div className="pipedrive-people">
          <h3>📋 People in Pipedrive ({pipedrivePersons.length})</h3>
          <div className="pipedrive-table-container">
            <table className="pipedrive-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Organization</th>
                </tr>
              </thead>
              <tbody>
                {pipedrivePersons.map(person => (
                  <tr key={person.id}>
                    <td><strong>{person.name}</strong></td>
                    <td>{person.email && person.email[0] ? person.email[0].value : '-'}</td>
                    <td>{person.phone && person.phone[0] ? person.phone[0].value : '-'}</td>
                    <td>{person.org_id?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="search-form">
            <div className="form-section">
              <div className="section-header-with-actions">
                <h3>Select Organizations ({searchParams.selectedOrganizations.length} selected)</h3>
                <div className="selection-actions">
                  <button className="btn-link" onClick={selectAllOrganizations}>
                    Select All
                  </button>
                  <button className="btn-link" onClick={deselectAllOrganizations}>
                    Deselect All
                  </button>
                </div>
              </div>
              
              {pipedriveOrganizations.length > 0 ? (
                <div className="pipedrive-table-container" style={{ marginTop: '1rem' }}>
                  <table className="pipedrive-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>Select</th>
                        <th>Name</th>
                        <th>Website</th>
                        <th>LinkedIn</th>
                        <th>People</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipedriveOrganizations.map(org => (
                        <tr key={org.id}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={searchParams.selectedOrganizations.includes(org.id)}
                              onChange={() => handleOrgSelection(org.id)}
                              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                            />
                          </td>
                          <td><strong>{org.name}</strong></td>
                          <td>
                            {org.website ? (
                              <a href={org.website.startsWith('http') ? org.website : `https://${org.website}`} target="_blank" rel="noopener noreferrer">
                                {org.website}
                              </a>
                            ) : '-'}
                          </td>
                          <td>
                            {org.linkedin ? (
                              <a href={org.linkedin.startsWith('http') ? org.linkedin : `https://${org.linkedin}`} target="_blank" rel="noopener noreferrer">
                                LinkedIn
                              </a>
                            ) : '-'}
                          </td>
                          <td>{org.people_count || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#666', padding: '1rem' }}>Loading organizations from Pipedrive...</p>
              )}
            </div>

            <div className="form-section">
              <h3>Job Titles</h3>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="e.g., CEO, VP of Sales, Marketing Director"
                  value={searchParams.personTitles.join(', ')}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      handleInputChange('personTitles', []);
                    } else {
                      handleInputChange('personTitles', value.split(',').map(s => s.trim()).filter(s => s));
                    }
                  }}
                />
                <small>Separate multiple titles with commas</small>
              </div>
            </div>

            <div className="form-section">
              <h3>Seniority Levels</h3>
              <div className="checkbox-group">
                {seniorities.map(seniority => (
                  <label key={seniority} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={searchParams.personSeniorities.includes(seniority)}
                      onChange={() => handleMultiSelectChange('personSeniorities', seniority)}
                    />
                    {seniority}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Departments</h3>
              <div className="checkbox-group">
                {departments.map(dept => (
                  <label key={dept} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={searchParams.personDepartments.includes(dept)}
                      onChange={() => handleMultiSelectChange('personDepartments', dept)}
                    />
                    {dept}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Email Verification</h3>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={searchParams.verifiedEmailOnly}
                    onChange={(e) => handleInputChange('verifiedEmailOnly', e.target.checked)}
                  />
                  <span>Only show people with verified emails</span>
                </label>
              </div>
              <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                ℹ️ Enabling this filter may significantly reduce results but ensures higher email deliverability
              </small>
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={isLoading || searchParams.selectedOrganizations.length === 0}
              >
                {isLoading ? '🔍 Searching...' : '🔍 Find People'}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              <div className="results-header">
                <h3>People Found ({searchResults.length})</h3>
                <button 
                  className="btn btn-success"
                  onClick={handleSaveToPipedrive}
                >
                  💾 Save to Pipedrive & Create Leads
                </button>
              </div>

              <div className="results-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Organization</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(person => (
                      <tr key={person.id}>
                        <td>
                          <div className="person-name">
                            {person.firstName} {person.lastName}
                            {person.linkedinUrl && (
                              <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer" className="linkedin-link">
                                🔗
                              </a>
                            )}
                          </div>
                        </td>
                        <td>{person.title}</td>
                        <td>{person.department}</td>
                        <td>{person.organization}</td>
                        <td><a href={`mailto:${person.email}`}>{person.email}</a></td>
                        <td>{person.phone}</td>
                        <td>
                          <button 
                            className="btn-icon"
                            onClick={() => handleRemovePerson(person.id)}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

    </div>
  );
}

export default PeopleFinder;