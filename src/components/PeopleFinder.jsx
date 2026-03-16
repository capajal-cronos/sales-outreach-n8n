import { useState } from 'react';
import './PeopleFinder.css';

function PeopleFinder({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [searchParams, setSearchParams] = useState({
    selectedOrganizations: [],
    personTitles: [],
    personSeniorities: [],
    personDepartments: [],
    personLocations: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(workflowData.people || []);

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

    // Simulate API call - Replace with actual n8n webhook call
    setTimeout(() => {
      const selectedOrgs = workflowData.organizations.filter(org => 
        searchParams.selectedOrganizations.includes(org.id)
      );

      const mockResults = selectedOrgs.flatMap(org => [
        {
          id: `${org.id}-1`,
          firstName: 'John',
          lastName: 'Doe',
          email: `john.doe@${org.domain}`,
          title: 'VP of Sales',
          seniority: 'VP',
          department: 'Sales',
          organization: org.name,
          organizationId: org.id,
          linkedinUrl: 'https://linkedin.com/in/johndoe',
          phone: '+1-555-0123'
        },
        {
          id: `${org.id}-2`,
          firstName: 'Jane',
          lastName: 'Smith',
          email: `jane.smith@${org.domain}`,
          title: 'Director of Marketing',
          seniority: 'Director',
          department: 'Marketing',
          organization: org.name,
          organizationId: org.id,
          linkedinUrl: 'https://linkedin.com/in/janesmith',
          phone: '+1-555-0124'
        }
      ]);

      setSearchResults(mockResults);
      setIsLoading(false);
    }, 1500);
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
      selectedOrganizations: workflowData.organizations.map(org => org.id)
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
        <p>Search for contacts within selected organizations</p>
      </div>

      {workflowData.organizations.length === 0 ? (
        <div className="empty-state">
          <p>⚠️ No organizations found. Please go back and search for organizations first.</p>
          <button className="btn btn-secondary" onClick={onPrevious}>
            ← Back to Organization Search
          </button>
        </div>
      ) : (
        <>
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
              <div className="organization-list">
                {workflowData.organizations.map(org => (
                  <label key={org.id} className="organization-checkbox">
                    <input
                      type="checkbox"
                      checked={searchParams.selectedOrganizations.includes(org.id)}
                      onChange={() => handleOrgSelection(org.id)}
                    />
                    <div className="org-info">
                      <strong>{org.name}</strong>
                      <span className="org-details">{org.domain} • {org.employees} employees</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Job Titles</h3>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="e.g., CEO, VP of Sales, Marketing Director"
                  value={searchParams.personTitles.join(', ')}
                  onChange={(e) => handleInputChange('personTitles', e.target.value.split(',').map(s => s.trim()))}
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

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={onPrevious}>
                ← Previous
              </button>
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

          <div className="webhook-info">
            <h4>🔗 n8n Webhook Integration</h4>
            <p>To automate people search, configure your n8n workflow with a webhook:</p>
            <code>POST /webhook/apollo-people-search</code>
            <p>The webhook should accept organization IDs and search criteria, then return contact results.</p>
          </div>
        </>
      )}
    </div>
  );
}

export default PeopleFinder;