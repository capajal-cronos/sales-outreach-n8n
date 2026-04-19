import { useState, useEffect } from 'react';
import './PeopleFinder.css';

const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

// Module-level stores survive component unmount. Switching tabs mid-fetch
// no longer restarts the fetch or drops already-loaded persons/orgs.
const personsStore = { data: null, isLoading: false, inflight: null, listeners: new Set() };
const orgsStore = { data: null, isLoading: false, inflight: null, listeners: new Set() };

const notifyStore = (store) => store.listeners.forEach(fn => fn());

async function fetchPersonDetail(person) {
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
}

async function runPersonsFetch() {
  personsStore.isLoading = true;
  personsStore.data = [];
  notifyStore(personsStore);

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
          const results = await Promise.all(batch.map(p => fetchPersonDetail(p)));
          personsStore.data = [...(personsStore.data || []), ...results];
          notifyStore(personsStore);
          if (i + BATCH_SIZE < data.data.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch Pipedrive persons:', err);
  } finally {
    personsStore.isLoading = false;
    personsStore.inflight = null;
    notifyStore(personsStore);
  }
}

function ensurePersonsLoaded() {
  if (personsStore.inflight) return personsStore.inflight;
  if (personsStore.data !== null) return Promise.resolve();
  personsStore.inflight = runPersonsFetch();
  return personsStore.inflight;
}

function refetchPersons() {
  if (personsStore.inflight) return personsStore.inflight;
  personsStore.inflight = runPersonsFetch();
  return personsStore.inflight;
}

async function runOrgsFetch() {
  orgsStore.isLoading = true;
  notifyStore(orgsStore);

  try {
    const response = await fetch(
      `https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`
    );

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        const detailedOrgs = await Promise.all(
          data.data.map(async (org) => {
            try {
              const detailResponse = await fetch(
                `https://api.pipedrive.com/v1/organizations/${org.id}?api_token=${PIPEDRIVE_API_KEY}`
              );
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (detailData.success && detailData.data) {
                  const apolloId = detailData.data['596a7f23303e67be9328a9f09ce7f4979caf2c7f'];
                  return { ...detailData.data, apollo_id: apolloId };
                }
                return detailData.success && detailData.data ? detailData.data : org;
              }
            } catch (err) {
              console.error(`Failed to fetch details for org ${org.id}:`, err);
            }
            return org;
          })
        );

        orgsStore.data = detailedOrgs;
        notifyStore(orgsStore);
      }
    }
  } catch (err) {
    console.error('Failed to fetch Pipedrive organizations:', err);
  } finally {
    orgsStore.isLoading = false;
    orgsStore.inflight = null;
    notifyStore(orgsStore);
  }
}

function ensureOrgsLoaded() {
  if (orgsStore.inflight) return orgsStore.inflight;
  if (orgsStore.data !== null) return Promise.resolve();
  orgsStore.inflight = runOrgsFetch();
  return orgsStore.inflight;
}

function PeopleFinder({ workflowData, updateWorkflowData, workflowErrors = [], onDismissError }) {
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
  const [searchStatus, setSearchStatus] = useState(null); // { type: 'error', message: string }
  const [pipedrivePersons, setPipedrivePersons] = useState(
    personsStore.data !== null ? personsStore.data : (workflowData.people || [])
  );
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState(
    orgsStore.data !== null ? orgsStore.data : (workflowData.organizations || [])
  );
  const [isLoadingPeople, setIsLoadingPeople] = useState(
    personsStore.data === null || personsStore.isLoading
  );
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(
    orgsStore.data === null || orgsStore.isLoading
  );
  const [headlineModal, setHeadlineModal] = useState({ show: false, headline: '', name: '' });
  const [foundPeopleModal, setFoundPeopleModal] = useState({ show: false, people: [] });
  const [currentOrgMapping, setCurrentOrgMapping] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState(new Set());
  const [selectedPipedrivePeople, setSelectedPipedrivePeople] = useState(new Set());
  const [isMakingLeads, setIsMakingLeads] = useState(false);
  const [makeLeadStatus, setMakeLeadStatus] = useState(null);
  const [peopleSearchQuery, setPeopleSearchQuery] = useState('');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  // Subscribe to module-level stores so data and in-flight fetches persist
  // across tab switches. Remounting no longer restarts or drops fetches.
  useEffect(() => {
    const syncPersons = () => {
      setPipedrivePersons(personsStore.data || []);
      setIsLoadingPeople(personsStore.isLoading || personsStore.data === null);
    };
    const syncOrgs = () => {
      setPipedriveOrganizations(orgsStore.data || []);
      setIsLoadingOrgs(orgsStore.isLoading || orgsStore.data === null);
    };
    personsStore.listeners.add(syncPersons);
    orgsStore.listeners.add(syncOrgs);
    ensurePersonsLoaded();
    ensureOrgsLoaded();
    return () => {
      personsStore.listeners.delete(syncPersons);
      orgsStore.listeners.delete(syncOrgs);
    };
  }, []);

  // Update workflowData when pipedrivePersons changes
  useEffect(() => {
    if (pipedrivePersons.length > 0) {
      updateWorkflowData('people', pipedrivePersons);
    }
  }, [pipedrivePersons]);

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
    setFoundPeopleModal({ show: false, people: [] });

    try {
      // Get Apollo IDs from selected organizations
      const selectedOrgs = pipedriveOrganizations.filter(org =>
        searchParams.selectedOrganizations.includes(org.id)
      );

      const apolloOrgs = selectedOrgs.filter(org => org.apollo_id);

      if (apolloOrgs.length === 0) {
        setSearchStatus({ type: 'error', message: 'Selected organizations do not have Apollo IDs. Please ensure organizations are synced with Apollo.' });
        setIsLoading(false);
        return;
      }

      // Create mapping of Apollo ID to Pipedrive ID
      const orgMapping = {};
      apolloOrgs.forEach(org => {
        orgMapping[org.apollo_id] = org.id;
      });

      const peoplePerCompany = searchParams.peoplePerCompany || 5;

      // Build set of existing names so we can skip duplicates
      const existingNames = new Set(
        pipedrivePersons.map(p => (p.name || '').trim().toLowerCase())
      );

      // Shared search filters
      const filterParams = {};
      if (searchParams.personTitles.length > 0) filterParams.person_titles = searchParams.personTitles;
      if (searchParams.personSeniorities.length > 0) filterParams.person_seniorities = searchParams.personSeniorities;
      if (searchParams.personDepartments.length > 0) filterParams.person_departments = searchParams.personDepartments;
      if (searchParams.personLocations.length > 0) filterParams.person_locations = searchParams.personLocations;
      if (searchParams.verifiedEmailOnly) filterParams.contact_email_status = ['verified'];

      // Search per organization so each company gets its own quota.
      // Request exact amount first; only paginate if duplicates were filtered.
      const parseWebhookResponse = (text) => {
        if (!text) return [];
        let data;
        try { data = JSON.parse(text); } catch { return []; }

        if (data.people && Array.isArray(data.people)) return data.people;
        if (data.contacts && Array.isArray(data.contacts)) return data.contacts;
        if (data.success && data.data) return Array.isArray(data.data) ? data.data : [data.data];
        if (Array.isArray(data)) return data.map(item => (item && item.json ? item.json : item));
        return [];
      };

      const fetchOrgPeople = async (org) => {
        let collected = [];
        let totalFromApollo = 0;
        let page = 1;

        while (collected.length < peoplePerCompany && page <= 3) {
          const deficit = peoplePerCompany - collected.length;
          // First page: request exact amount. Follow-ups: just the deficit.
          const perPage = page === 1 ? peoplePerCompany : deficit;

          const requestBody = {
            organization_ids: [org.apollo_id],
            pipedrive_org_mapping: { [org.apollo_id]: org.id },
            page,
            per_page: perPage,
            ...filterParams
          };

          try {
            const response = await fetch('https://aigeneers.app.n8n.cloud/webhook/find-people', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });

            if (!response.ok) break;

            const people = parseWebhookResponse(await response.text());
            if (people.length === 0) break;

            totalFromApollo += people.length;

            const newPeople = people.filter(
              p => !existingNames.has((p.name || '').trim().toLowerCase())
            );
            collected.push(...newPeople);

            // Apollo had fewer than requested — no more results available
            if (people.length < perPage) break;
          } catch {
            break;
          }

          page++;
        }

        return {
          newPeople: collected.slice(0, peoplePerCompany),
          totalFromApollo
        };
      };

      const results = await Promise.all(apolloOrgs.map(fetchOrgPeople));
      const allNewPeople = results.flatMap(r => r.newPeople);
      const totalFromApollo = results.reduce((sum, r) => sum + r.totalFromApollo, 0);
      const skipped = totalFromApollo - allNewPeople.length;

      setCurrentOrgMapping(orgMapping);

      if (allNewPeople.length > 0) {
        setSelectedPeople(new Set(allNewPeople.filter(p => p.email).map((p, i) => p.id || `idx-${i}`)));
        setFoundPeopleModal({ show: true, people: allNewPeople });
        if (skipped > 0) {
          setSearchStatus({ type: 'success', message: `Found ${allNewPeople.length} new people (${skipped} already in Pipedrive)` });
        }
      } else if (totalFromApollo > 0) {
        setSearchStatus({ type: 'success', message: `All ${totalFromApollo} found people are already in Pipedrive` });
      } else {
        setSearchStatus({ type: 'success', message: 'No people found for the selected organizations' });
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
    setSelectedPeople(new Set(foundPeopleModal.people.filter(p => p.email).map((p, i) => p.id || `idx-${i}`)));
  };

  const deselectAllFoundPeople = () => {
    setSelectedPeople(new Set());
  };

  const handleSaveFoundPeople = async () => {
    const peopleToSave = foundPeopleModal.people.filter((p, i) => selectedPeople.has(p.id || `idx-${i}`));
    if (peopleToSave.length === 0) return;

    // Double-check: only send people that actually have an email
    const withEmail = peopleToSave.filter(p => p.email);
    if (withEmail.length === 0) return;

    setIsSaving(true);
    try {
      await fetch('https://aigeneers.app.n8n.cloud/webhook/save-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people: withEmail, pipedrive_org_mapping: currentOrgMapping })
      });
      setFoundPeopleModal({ show: false, people: [] });
      await refetchPersons();
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

  const togglePipedrivePersonSelection = (personId) => {
    setSelectedPipedrivePeople(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const toggleAllPipedrivePeople = () => {
    setSelectedPipedrivePeople(prev => {
      if (prev.size === pipedrivePersons.length) return new Set();
      return new Set(pipedrivePersons.map(p => p.id));
    });
  };

  const handleMakeLeads = async () => {
    if (selectedPipedrivePeople.size === 0) return;
    setIsMakingLeads(true);
    setMakeLeadStatus(null);

    try {
      const selectedPersons = pipedrivePersons.filter(p => selectedPipedrivePeople.has(p.id));

      const response = await fetch('https://aigeneers.app.n8n.cloud/webhook/make-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: selectedPersons.map(p => ({
            id: p.id,
            name: p.name,
            org_id: p.org_id?.value || null
          }))
        })
      });

      const data = await response.json();

      let message = '';
      if (data.creating > 0) {
        message = `${data.creating} lead${data.creating !== 1 ? 's' : ''} created`;
      }
      if (data.skipped > 0) {
        const skippedPart = `${data.skipped} already existed`;
        message = message ? `${message} (${skippedPart})` : `${data.skipped === 1 ? 'This person already has a lead' : `All ${data.skipped} people already have leads`}`;
      }

      setMakeLeadStatus({
        type: data.creating > 0 ? 'success' : 'error',
        message: message || 'No leads to create'
      });
      setSelectedPipedrivePeople(new Set());
    } catch (error) {
      setMakeLeadStatus({ type: 'error', message: `Failed to create leads: ${error.message}` });
    } finally {
      setIsMakingLeads(false);
    }
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
          <div className="section-header-with-actions">
            <h3>People in Pipedrive ({pipedrivePersons.length})</h3>
            <div className="selection-actions">
              <button className="btn-link" onClick={toggleAllPipedrivePeople}>
                {selectedPipedrivePeople.size === pipedrivePersons.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleMakeLeads}
                disabled={selectedPipedrivePeople.size === 0 || isMakingLeads}
              >
                {isMakingLeads ? 'Creating...' : `Make Lead (${selectedPipedrivePeople.size})`}
              </button>
            </div>
          </div>
          {makeLeadStatus && (
            <p className={`search-status search-status--${makeLeadStatus.type}`}>
              {makeLeadStatus.message}
            </p>
          )}
          <input
            type="text"
            className="filter-input"
            placeholder="Search people..."
            value={peopleSearchQuery}
            onChange={e => setPeopleSearchQuery(e.target.value)}
            style={{ marginBottom: '0.75rem', width: '100%', maxWidth: '320px' }}
          />
          <div className="pipedrive-table-container">
            <table className="pipedrive-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedPipedrivePeople.size === pipedrivePersons.length && pipedrivePersons.length > 0}
                      onChange={toggleAllPipedrivePeople}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th>Name</th>
                  <th>Headline</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Organization</th>
                  <th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {pipedrivePersons.filter(person => {
                  if (!peopleSearchQuery) return true;
                  const q = peopleSearchQuery.toLowerCase();
                  const name = (person.name || '').toLowerCase();
                  const email = (person.email && person.email[0] ? person.email[0].value : '').toLowerCase();
                  const org = (person.org_id?.name || '').toLowerCase();
                  return name.includes(q) || email.includes(q) || org.includes(q);
                }).map(person => {
                  const headline = person.headline || '';
                  const linkedinUrl = person.linkedin_url || '';
                  const isSelected = selectedPipedrivePeople.has(person.id);

                  return (
                    <tr key={person.id} style={{ cursor: 'pointer' }} onClick={() => togglePipedrivePersonSelection(person.id)}>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePipedrivePersonSelection(person.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      <td><strong>{person.name}</strong></td>
                      <td style={{ fontSize: '0.9em', color: '#666' }}>
                        {person._detailFetchFailed ? (
                          <span style={{ color: 'orange' }}>Failed to load</span>
                        ) : headline ? (
                          <span
                            style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                            onClick={(e) => { e.stopPropagation(); setHeadlineModal({ show: true, headline, name: person.name }); }}
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
                          <a href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
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

      <div className="section-header" style={{ marginTop: '2.5rem' }}>
        <h2>Search for New People</h2>
        <p>Use Apollo to find new contacts within your Pipedrive organizations</p>
      </div>

      <div className="search-form search-new-people">
            <div className="form-section">
              <div className="section-header-with-actions">
                <h3>Organizations</h3>
                <div className="selection-actions">
                  <button className="btn-link" onClick={selectAllOrganizations}>
                    Select All
                  </button>
                  <button className="btn-link" onClick={deselectAllOrganizations}>
                    Deselect All
                  </button>
                </div>
              </div>
              <p className="form-section-hint">{searchParams.selectedOrganizations.length} of {pipedriveOrganizations.length} selected</p>

              {isLoadingOrgs ? (
                <div className="loading-container">
                  <div className="spinner-large"></div>
                  <p>Loading organizations from Pipedrive...</p>
                </div>
              ) : pipedriveOrganizations.length > 0 ? (
                <>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search organizations..."
                  value={orgSearchQuery}
                  onChange={e => setOrgSearchQuery(e.target.value)}
                  style={{ width: '100%', maxWidth: '320px' }}
                />
                <div className="pipedrive-table-container" style={{ marginTop: '0.75rem' }}>
                  <table className="pipedrive-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            title={searchParams.selectedOrganizations.length === pipedriveOrganizations.length ? 'Deselect all' : 'Select all'}
                            checked={searchParams.selectedOrganizations.length === pipedriveOrganizations.length && pipedriveOrganizations.length > 0}
                            onChange={e => e.target.checked ? selectAllOrganizations() : deselectAllOrganizations()}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </th>
                        <th>Name</th>
                        <th>Website</th>
                        <th>LinkedIn</th>
                        <th>People</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipedriveOrganizations.filter(org => {
                        if (!orgSearchQuery) return true;
                        const q = orgSearchQuery.toLowerCase();
                        return (org.name || '').toLowerCase().includes(q) || (org.website || '').toLowerCase().includes(q);
                      }).map(org => {
                        const isSelected = searchParams.selectedOrganizations.includes(org.id);
                        return (
                          <tr
                            key={org.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleOrgSelection(org.id)}
                          >
                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleOrgSelection(org.id)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                            </td>
                            <td><strong>{org.name}</strong></td>
                            <td>
                              {org.website ? (
                                <a href={org.website.startsWith('http') ? org.website : `https://${org.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  {org.website}
                                </a>
                              ) : '-'}
                            </td>
                            <td>
                              {org.linkedin ? (
                                <a href={org.linkedin.startsWith('http') ? org.linkedin : `https://${org.linkedin}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  LinkedIn
                                </a>
                              ) : '-'}
                            </td>
                            <td>{org.people_count || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-secondary)', padding: '1rem' }}>No organizations found in Pipedrive.</p>
              )}
            </div>

            <div className="form-section">
              <h3>Job Titles</h3>
              <p className="form-section-hint">Separate multiple titles with commas</p>
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
              </div>
            </div>

            <div className="form-section">
              <h3>Seniority Levels</h3>
              <p className="form-section-hint">Select the seniority levels you want to target</p>
              <div className="pill-group">
                {seniorities.map(seniority => (
                  <button
                    key={seniority}
                    type="button"
                    className={`pill-toggle${searchParams.personSeniorities.includes(seniority) ? ' active' : ''}`}
                    onClick={() => handleMultiSelectChange('personSeniorities', seniority)}
                  >
                    {seniority}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Departments</h3>
              <p className="form-section-hint">Pick the departments to search within</p>
              <div className="pill-group">
                {departments.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    className={`pill-toggle${searchParams.personDepartments.includes(dept) ? ' active' : ''}`}
                    onClick={() => handleMultiSelectChange('personDepartments', dept)}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Results</h3>
              <div className="settings-row">
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={searchParams.verifiedEmailOnly}
                      onChange={(e) => handleInputChange('verifiedEmailOnly', e.target.checked)}
                    />
                    <span>Verified emails only</span>
                  </label>
                  <div className="setting-hint">May reduce results but ensures higher deliverability</div>
                </div>
                <div className="setting-item">
                  <div className="limit-input-row">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={searchParams.peoplePerCompany}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleInputChange('peoplePerCompany', val === '' ? '' : Math.max(1, Math.min(50, parseInt(val) || 1)));
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '') {
                          handleInputChange('peoplePerCompany', 5);
                        }
                      }}
                    />
                    <span>people per company</span>
                  </div>
                  <div className="setting-hint">Limit 1–50 contacts per organization</div>
                </div>
              </div>
            </div>

            <div className="search-cta">
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
                    <th>Company</th>
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
                    const hasEmail = !!person.email;
                    const companyName = person.organization_name || person.organization?.name || '-';
                    return (
                      <tr
                        key={key}
                        style={{ cursor: hasEmail ? 'pointer' : 'default', opacity: hasEmail ? 1 : 0.55 }}
                        onClick={() => hasEmail && togglePersonSelection(key)}
                      >
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!hasEmail}
                            onChange={() => hasEmail && togglePersonSelection(key)}
                            style={{ cursor: hasEmail ? 'pointer' : 'not-allowed', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td><strong>{person.name || '-'}</strong></td>
                        <td style={{ fontSize: '0.9em' }}>{companyName}</td>
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
                        <td style={{ fontSize: '0.9em' }}>
                          {person.email || <span style={{ color: 'var(--error-color)', fontWeight: 500, fontSize: '0.8em' }}>No email</span>}
                        </td>
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
                {selectedPeople.size} of {foundPeopleModal.people.filter(p => p.email).length} with email selected
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