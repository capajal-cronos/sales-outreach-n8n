import { useState, useEffect, useRef } from 'react';
import './PeopleFinder.css';

function PeopleFinder({ workflowData, updateWorkflowData, onNext, onPrevious, workflowErrors = [], onDismissError }) {
  const [searchParams, setSearchParams] = useState({
    selectedOrganizations: [],
    personTitles: [],
    personSeniorities: [],
    personDepartments: [],
    personLocations: [],
    verifiedEmailOnly: false,
    perPage: 10,
    maxPages: 5,
    peoplePerCompany: 5  // New parameter to limit people per company
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPeople, setIsLoadingPeople] = useState(true);
  const [searchStatus, setSearchStatus] = useState(null); // { type: 'error', message: string }
  const [pipedrivePersons, setPipedrivePersons] = useState(workflowData.people || []);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState(workflowData.organizations || []);
  const [headlineModal, setHeadlineModal] = useState({ show: false, headline: '', name: '' });
  const [foundPeopleModal, setFoundPeopleModal] = useState({ show: false, people: [] });
  const [currentOrgMapping, setCurrentOrgMapping] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState(new Set());

  // Ref to prevent double fetching in StrictMode
  const hasFetchedRef = useRef(false);

  // Get Pipedrive API key from environment
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Fetch people and organizations from Pipedrive on mount
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchPipedrivePersons(); // Always refresh — deletions in Pipedrive must be reflected
      fetchPipedriveOrganizations(); // Always refresh — cached orgs may lack apollo_id
    }
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

  const fetchPersonDetail = async (person) => {
    let retries = 2;
    while (retries >= 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const detailResponse = await fetch(
          `https://api.pipedrive.com/api/v2/persons/${person.id}?api_token=${PIPEDRIVE_API_KEY}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          if (detailData && detailData.success && detailData.data) {
            const personData = detailData.data;
            let headline = '';
            let linkedinUrl = '';
            if (personData.custom_fields) {
              linkedinUrl = personData.custom_fields['7b02e9595a92744d8da04aaf22be9bbb17cb4a67'] || '';
              headline = personData.custom_fields['86c0c96c777b219fb2989b0121c709d30882d384'] || '';
            }
            return { ...person, headline, linkedin_url: linkedinUrl };
          }
        } else if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      retries--;
    }
    console.error(`Failed to fetch person ${person.id} after retries`);
    return { ...person, headline: null, linkedin_url: null, _detailFetchFailed: true };
  };

  const fetchPipedrivePersons = async () => {
    setIsLoadingPeople(true);
    setPipedrivePersons([]);
    try {
      const response = await fetch(
        `https://api.pipedrive.com/v1/persons?api_token=${PIPEDRIVE_API_KEY}&limit=100`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const BATCH_SIZE = 5;
          const BATCH_DELAY_MS = 600;

          for (let i = 0; i < data.data.length; i += BATCH_SIZE) {
            const batch = data.data.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(person => fetchPersonDetail(person)));
            setPipedrivePersons(prev => [...prev, ...results]);
            if (i + BATCH_SIZE < data.data.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch Pipedrive persons:', err);
    } finally {
      setIsLoadingPeople(false);
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
      setSearchStatus({ type: 'error', message: 'Please select at least one organization' });
      return;
    }

    setIsLoading(true);
    setSearchStatus(null);

    try {
      // Get Apollo IDs from selected organizations
      const selectedOrgs = pipedriveOrganizations.filter(org =>
        searchParams.selectedOrganizations.includes(org.id)
      );

      const apolloIds = selectedOrgs
        .map(org => org.apollo_id)
        .filter(id => id);

      if (apolloIds.length === 0) {
        setSearchStatus({ type: 'error', message: 'Selected organizations do not have Apollo IDs. Please ensure organizations are synced with Apollo.' });
        setIsLoading(false);
        return;
      }

      // Create mapping of Apollo ID to Pipedrive ID
      const orgMapping = {};
      selectedOrgs.forEach(org => {
        if (org.apollo_id) {
          orgMapping[org.apollo_id] = org.id;
        }
      });

      const peoplePerCompany = searchParams.peoplePerCompany || 5;
      const perPage = Math.min(apolloIds.length * peoplePerCompany, 100);

      const requestBody = {
        organization_ids: apolloIds,
        pipedrive_org_mapping: orgMapping,
        page: 1,
        per_page: perPage
      };

      if (searchParams.personTitles.length > 0) requestBody.person_titles = searchParams.personTitles;
      if (searchParams.personSeniorities.length > 0) requestBody.person_seniorities = searchParams.personSeniorities;
      if (searchParams.personDepartments.length > 0) requestBody.person_departments = searchParams.personDepartments;
      if (searchParams.personLocations.length > 0) requestBody.person_locations = searchParams.personLocations;
      if (searchParams.verifiedEmailOnly) requestBody.contact_email_status = ['verified'];

      const response = await fetch('https://aigeneers.app.n8n.cloud/webhook/find-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      let allPeople = [];
      if (data.people && Array.isArray(data.people)) {
        allPeople = data.people;
      } else if (data.contacts && Array.isArray(data.contacts)) {
        allPeople = data.contacts;
      } else if (data.success && data.data) {
        allPeople = Array.isArray(data.data) ? data.data : [data.data];
      } else if (Array.isArray(data)) {
        allPeople = data.map(item => (item && item.json ? item.json : item));
      }

      // Limit per company. When organization_id is absent, fall back to a slot
      // called '__unknown__' so it still respects the per-company cap.
      const limitedPeople = [];
      const companyCount = {};

      for (const person of allPeople) {
        const orgId = person.organization_id || person.organization?.id || '__unknown__';
        companyCount[orgId] = companyCount[orgId] || 0;
        if (companyCount[orgId] < peoplePerCompany) {
          limitedPeople.push(person);
          companyCount[orgId]++;
        }
      }

      setCurrentOrgMapping(orgMapping);

      // Filter out people already in Pipedrive (match by name, case-insensitive)
      const existingNames = new Set(
        pipedrivePersons.map(p => (p.name || '').trim().toLowerCase())
      );
      const newPeople = limitedPeople.filter(
        p => !existingNames.has((p.name || '').trim().toLowerCase())
      );

      if (newPeople.length > 0) {
        setSelectedPeople(new Set(newPeople.map((p, i) => p.id || `idx-${i}`)));
        setFoundPeopleModal({ show: true, people: newPeople });
        if (newPeople.length < limitedPeople.length) {
          const skipped = limitedPeople.length - newPeople.length;
          setSearchStatus({ type: 'success', message: `Found ${newPeople.length} new people (${skipped} already in Pipedrive)` });
        }
      } else if (limitedPeople.length > 0) {
        setSearchStatus({ type: 'success', message: `All ${limitedPeople.length} found people are already in Pipedrive` });
      }
    } catch (error) {
      console.error('Error searching for people:', error);
      setSearchStatus({ type: 'error', message: `Failed to search for people: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePersonSelection = (key) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFoundPeople = () => {
    setSelectedPeople(new Set(foundPeopleModal.people.map((p, i) => p.id || `idx-${i}`)));
  };

  const deselectAllFoundPeople = () => {
    setSelectedPeople(new Set());
  };

  const handleSaveFoundPeople = async () => {
    const peopleToSave = foundPeopleModal.people.filter((p, i) => selectedPeople.has(p.id || `idx-${i}`));
    if (peopleToSave.length === 0) return;
    setIsSaving(true);
    try {
      await fetch('https://aigeneers.app.n8n.cloud/webhook/save-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people: peopleToSave, pipedrive_org_mapping: currentOrgMapping })
      });
      setFoundPeopleModal({ show: false, people: [] });
      await fetchPipedrivePersons();
    } finally {
      setIsSaving(false);
    }
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
        <h2>Find People</h2>
        <p>Search for contacts within selected organizations or view existing people from Pipedrive</p>
      </div>

      {/* Pipedrive People */}
      {isLoadingPeople ? (
        <div className="loading-container">
          <div className="spinner-large"></div>
          <p>Loading people from Pipedrive...</p>
        </div>
      ) : pipedrivePersons.length > 0 && (
        <div className="pipedrive-people">
          <h3>People in Pipedrive ({pipedrivePersons.length})</h3>
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

                  return (
                    <tr key={person.id}>
                      <td><strong>{person.name}</strong></td>
                      <td style={{ fontSize: '0.9em', color: '#666' }}>
                        {person._detailFetchFailed ? (
                          <span style={{ color: 'orange' }}>Failed to load</span>
                        ) : headline ? (
                          <span
                            style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                            onClick={() => setHeadlineModal({ show: true, headline, name: person.name })}
                            title="Click to read full headline"
                          >
                            {headline}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{person.email && person.email[0] ? person.email[0].value : '-'}</td>
                      <td>{person.phone && person.phone[0] ? person.phone[0].value : '-'}</td>
                      <td>{person.org_id?.name || '-'}</td>
                      <td>
                        {person._detailFetchFailed ? (
                          <span style={{ color: 'orange' }}>Failed to load</span>
                        ) : linkedinUrl ? (
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
                Enabling this filter may significantly reduce results but ensures higher email deliverability
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
                  Limit the number of people to find per company (1-50)
                </small>
              </div>
            </div>

            <div className="form-actions">
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
              {searchStatus && (
                <p className={`search-status search-status--${searchStatus.type}`}>
                  {searchStatus.message}
                </p>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={isLoading || searchParams.selectedOrganizations.length === 0}
              >
                {isLoading ? 'Searching...' : 'Find People'}
              </button>
            </div>
          </div>

      {/* Found People Modal */}
      {foundPeopleModal.show && foundPeopleModal.people.length > 0 && (
        <div className="modal-overlay" onClick={() => setFoundPeopleModal({ show: false, people: [] })}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Found {foundPeopleModal.people.length} people</h3>
              <button className="modal-close" onClick={() => setFoundPeopleModal({ show: false, people: [] })}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Select people to save to Pipedrive.
              </p>
              <table className="pipedrive-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        title={selectedPeople.size === foundPeopleModal.people.length ? 'Deselect all' : 'Select all'}
                        checked={selectedPeople.size === foundPeopleModal.people.length && foundPeopleModal.people.length > 0}
                        onChange={e => e.target.checked ? selectAllFoundPeople() : deselectAllFoundPeople()}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th>Name</th>
                    <th>Title / Headline</th>
                    <th>Email</th>
                    <th>LinkedIn</th>
                  </tr>
                </thead>
                <tbody>
                  {foundPeopleModal.people.map((person, idx) => {
                    const key = person.id || `idx-${idx}`;
                    const isSelected = selectedPeople.has(key);
                    const headline = person.headline || person.title || '';
                    const truncated = headline.length > 60 ? headline.substring(0, 60) + '…' : headline;
                    const linkedin = person.linkedin_url || '';
                    return (
                      <tr
                        key={key}
                        style={{ cursor: 'pointer', opacity: isSelected ? 1 : 0.45 }}
                        onClick={() => togglePersonSelection(key)}
                      >
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePersonSelection(key)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td><strong>{person.name || '-'}</strong></td>
                        <td style={{ fontSize: '0.9em', color: '#555' }}>
                          {headline.length > 60 ? (
                            <span
                              style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                              onClick={e => { e.stopPropagation(); setHeadlineModal({ show: true, headline, name: person.name }); }}
                              title="Click to read full headline"
                            >
                              {truncated}
                            </span>
                          ) : (truncated || '-')}
                        </td>
                        <td style={{ fontSize: '0.9em' }}>{person.email || '-'}</td>
                        <td>
                          {linkedin ? (
                            <a
                              href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
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
            <div style={{ padding: '1rem 1.5rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                {selectedPeople.size} of {foundPeopleModal.people.length} selected
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setFoundPeopleModal({ show: false, people: [] })}>
                  Decline All
                </button>
                <button className="btn btn-primary" onClick={handleSaveFoundPeople} disabled={isSaving || selectedPeople.size === 0}>
                  {isSaving ? 'Saving...' : `Accept ${selectedPeople.size === foundPeopleModal.people.length ? 'All' : `${selectedPeople.size}`}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Headline Modal */}
      {headlineModal.show && (
        <div className="modal-overlay" onClick={() => setHeadlineModal({ show: false, headline: '', name: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Full Headline</h3>
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