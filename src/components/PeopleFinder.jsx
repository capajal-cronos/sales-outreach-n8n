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
    maxPages: 4,
    peoplePerCompany: 5  // New parameter to limit people per company
  });

  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(workflowData.people || []);
  const [pipedrivePersons, setPipedrivePersons] = useState([]);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState([]);
  const [headlineModal, setHeadlineModal] = useState({ show: false, headline: '', name: '' });

  // Get Pipedrive API key from environment
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Fetch people and organizations from Pipedrive on mount
  useEffect(() => {
    fetchPipedrivePersons();
    fetchPipedriveOrganizations();
  }, []);

  // Update workflowData when pipedrivePersons changes
  useEffect(() => {
    if (pipedrivePersons.length > 0) {
      updateWorkflowData('people', pipedrivePersons);
    }
  }, [pipedrivePersons]);

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
          console.log(`Fetching details for ${data.data.length} persons...`);
          
          // Fetch detailed info sequentially with delay to avoid rate limits
          const detailedPersons = [];
          for (let index = 0; index < data.data.length; index++) {
            const person = data.data[index];
            
            try {
              // Add delay between requests to avoid rate limiting (150ms = ~6 requests/second)
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, 150));
              }
              
              // Use v2 API endpoint for better data
              const detailResponse = await fetch(
                `https://api.pipedrive.com/api/v2/persons/${person.id}?api_token=${PIPEDRIVE_API_KEY}`
              );
              
              console.log(`Person ${index + 1}/${data.data.length} - Response status:`, detailResponse.status);
              
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                
                // Log first person's full v2 response to see structure
                if (index === 0) {
                  console.log('First person v2 API response:', JSON.stringify(detailData, null, 2));
                }
                
                if (detailData.success && detailData.data) {
                  const personData = detailData.data;
                  
                  // Extract headline and LinkedIn from custom_fields using specific keys
                  let headline = '';
                  let linkedinUrl = '';
                  
                  if (personData.custom_fields) {
                    // LinkedIn is in field: 7b02e9595a92744d8da04aaf22be9bbb17cb4a67
                    linkedinUrl = personData.custom_fields['7b02e9595a92744d8da04aaf22be9bbb17cb4a67'] || '';
                    
                    // Headline is in field: 86c0c96c777b219fb2989b0121c709d30882d384
                    headline = personData.custom_fields['86c0c96c777b219fb2989b0121c709d30882d384'] || '';
                  }
                  
                  console.log(`Person ${person.name}: headline="${headline}", linkedin="${linkedinUrl}"`);
                  
                  // Add combined data with extracted fields
                  detailedPersons.push({
                    ...person,
                    headline: headline,
                    linkedin_url: linkedinUrl
                  });
                } else {
                  detailedPersons.push(person);
                }
              } else {
                const errorText = await detailResponse.text();
                console.error(`Failed to fetch person ${person.id}:`, detailResponse.status, errorText);
                detailedPersons.push(person);
              }
            } catch (err) {
              console.error(`Failed to fetch details for person ${person.id}:`, err);
              detailedPersons.push(person);
            }
          }
          
          console.log('Finished fetching all person details');
          setPipedrivePersons(detailedPersons);
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
    console.log('🚀 Starting people search workflow...');

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
      const peoplePerCompany = searchParams.peoplePerCompany || 5;
      // Calculate per_page based on number of companies and people per company
      const perPage = Math.min(apolloIds.length * peoplePerCompany, 100); // Apollo max is 100
      let allPeople = [];

      console.log(`Requesting ${perPage} people per page (${apolloIds.length} companies × ${peoplePerCompany} people per company)`);

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

        if (people.length === 0) {
          console.log('No more results, stopping pagination');
          break;
        }

        allPeople = allPeople.concat(people);

        // If we got fewer results than perPage, we've reached the end
        if (people.length < perPage) {
          console.log('Received fewer results than requested, stopping pagination');
          break;
        }
      }

      console.log(`Total: ${allPeople.length} people found before limiting`);
      
      // Limit people per company (peoplePerCompany already declared above)
      const limitedPeople = [];
      const companyCount = {};
      
      for (const person of allPeople) {
        const orgId = person.organization_id || person.organization?.id;
        if (!orgId) {
          limitedPeople.push(person);
          continue;
        }
        
        if (!companyCount[orgId]) {
          companyCount[orgId] = 0;
        }
        
        if (companyCount[orgId] < peoplePerCompany) {
          limitedPeople.push(person);
          companyCount[orgId]++;
        }
      }
      
      console.log(`After limiting to ${peoplePerCompany} per company: ${limitedPeople.length} people`);
      
      setSearchResults(limitedPeople);
      
      // Success feedback
      console.log('✅ People search workflow completed successfully!');
      alert(`✅ Search complete! Found ${limitedPeople.length} people across ${apolloIds.length} companies.`);
    } catch (error) {
      console.error('❌ Error searching for people:', error);
      alert(`❌ Failed to search for people: ${error.message}`);
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
                  <th>Headline</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Organization</th>
                  <th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {pipedrivePersons.map(person => {
                  const headline = person.headline || '';
                  const linkedinUrl = person.linkedin_url || '';
                  const truncatedHeadline = headline.length > 50 ? headline.substring(0, 50) + '...' : headline;
                  
                  return (
                    <tr key={person.id}>
                      <td><strong>{person.name}</strong></td>
                      <td style={{ fontSize: '0.9em', color: '#666' }}>
                        {headline ? (
                          headline.length > 50 ? (
                            <span
                              style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                              onClick={() => setHeadlineModal({ show: true, headline, name: person.name })}
                              title="Click to read full headline"
                            >
                              {truncatedHeadline}
                            </span>
                          ) : (
                            headline
                          )
                        ) : '-'}
                      </td>
                      <td>{person.email && person.email[0] ? person.email[0].value : '-'}</td>
                      <td>{person.phone && person.phone[0] ? person.phone[0].value : '-'}</td>
                      <td>{person.org_id?.name || '-'}</td>
                      <td>
                        {linkedinUrl ? (
                          <a href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`} target="_blank" rel="noopener noreferrer">
                            LinkedIn
                          </a>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
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
                  defaultValue={searchParams.personTitles.join(', ')}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      handleInputChange('personTitles', []);
                    } else {
                      handleInputChange('personTitles', value.split(',').map(s => s.trim()).filter(s => s));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = e.target.value;
                      if (value === '') {
                        handleInputChange('personTitles', []);
                      } else {
                        handleInputChange('personTitles', value.split(',').map(s => s.trim()).filter(s => s));
                      }
                    }
                  }}
                />
                <small>Separate multiple titles with commas (press Enter or click away to save)</small>
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

            <div className="form-section">
              <h3>Results Limit</h3>
              <div className="form-group">
                <label>People per Company:</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={searchParams.peoplePerCompany}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow empty string for clearing, otherwise parse as number
                    handleInputChange('peoplePerCompany', val === '' ? '' : Math.max(1, Math.min(50, parseInt(val) || 1)));
                  }}
                  onBlur={(e) => {
                    // On blur, if empty, set to default 5
                    if (e.target.value === '') {
                      handleInputChange('peoplePerCompany', 5);
                    }
                  }}
                  style={{ width: '100px' }}
                />
                <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                  ℹ️ Limit the number of people to find per company (1-50)
                </small>
              </div>
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

      {/* Headline Modal */}
      {headlineModal.show && (
        <div className="modal-overlay" onClick={() => setHeadlineModal({ show: false, headline: '', name: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Full Headline</h3>
              <button className="modal-close" onClick={() => setHeadlineModal({ show: false, headline: '', name: '' })}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', fontWeight: '600' }}>{headlineModal.name}</p>
              <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}>{headlineModal.headline}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PeopleFinder;