import { useState, useRef, useEffect } from 'react';
import './OrganizationSearch.css';
import {
  initDatabase,
  getAllOrganizations,
  addOrganization,
  deleteOrganization,
  importOrganizations,
  getStatistics
} from '../utils/apiClient';

function OrganizationSearch({ workflowData, updateWorkflowData, onNext }) {
  const [searchMode, setSearchMode] = useState('manual'); // 'manual', 'file', or 'filters'
  const [searchParams, setSearchParams] = useState({
    organizationName: '',
    organizationDomain: '',
    organizationNumEmployeesRanges: [],
    organizationLocations: [],
    organizationIndustryTagIds: [],
    personTitles: [],
    revenueRange: [],
    perPage: 5
  });

  const [uploadedFile, setUploadedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState([]);
  const [dbOrganizations, setDbOrganizations] = useState([]);
  const [dbStats, setDbStats] = useState({ total: 0, processed: 0, unprocessed: 0, errors: 0 });
  const [industryTagsInput, setIndustryTagsInput] = useState('');
  const [error, setError] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [apolloPendingOrgs, setApolloPendingOrgs] = useState([]);
  const [selectedApolloOrgs, setSelectedApolloOrgs] = useState(new Set());
  const fileInputRef = useRef(null);
  const locationInputRef = useRef(null);

  // Get configuration from environment variables
  const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
  const N8N_FILTERS_WEBHOOK_URL = import.meta.env.VITE_N8N_FILTERS_WEBHOOK_URL || 'https://aigeneers.app.n8n.cloud/webhook-test/organization-filters';
  const N8N_FILE_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook-test/organizations-file';
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Initialize database and load organizations on mount
  useEffect(() => {
    async function init() {
      await initDatabase();
      loadDbOrganizations();
      fetchPipedriveOrganizations();
      loadApolloPendingOrgs();
    }
    init();
  }, []);

  // Load pending Apollo organizations
  const loadApolloPendingOrgs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/apollo/pending');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setApolloPendingOrgs(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load Apollo pending organizations:', err);
    }
  };

  // Load organizations from database
  const loadDbOrganizations = async () => {
    const orgs = await getAllOrganizations();
    setDbOrganizations(orgs);
    const stats = await getStatistics();
    setDbStats(stats);
  };

  // Fetch organizations from Pipedrive and import to database
  const fetchPipedriveOrganizations = async () => {
    try {
      // Fetch organizations with all fields
      const response = await fetch(
        `https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Fetch detailed info for each organization to get website
          const detailedOrgs = await Promise.all(
            data.data.map(async (org) => {
              try {
                const detailResponse = await fetch(
                  `https://api.pipedrive.com/v1/organizations/${org.id}?api_token=${PIPEDRIVE_API_KEY}`
                );
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  return detailData.success && detailData.data ? detailData.data : org;
                }
              } catch (err) {
                console.error(`Failed to fetch details for org ${org.id}:`, err);
              }
              return org;
            })
          );
          
          setPipedriveOrganizations(detailedOrgs);
          
          // Import Pipedrive organizations to database
          const orgsToImport = detailedOrgs.map(org => ({
            name: org.name || '',
            domain: org.website || org.address || '',
            industry: '',
            employees: org.people_count?.toString() || '',
            location: org.address || '',
            revenue: '',
            description: '',
            processed: 'pipedrive',
            error_message: ''
          }));
          
          // Import to database (will skip duplicates)
          await importOrganizations(orgsToImport);
          await loadDbOrganizations();
        }
      }
    } catch (err) {
      console.error('Failed to fetch Pipedrive organizations:', err);
    }
  };

  // Apollo.io organization search parameters
  const employeeRanges = [
    { value: '1,10', label: '1-10 employees' },
    { value: '11,50', label: '11-50 employees' },
    { value: '51,200', label: '51-200 employees' },
    { value: '201,500', label: '201-500 employees' },
    { value: '501,1000', label: '501-1,000 employees' },
    { value: '1001,5000', label: '1,001-5,000 employees' },
    { value: '5001,10000', label: '5,001-10,000 employees' },
    { value: '10001,max', label: '10,001+ employees' }
  ];

  const revenueRanges = [
    { value: '0,1M', label: '$0-$1M' },
    { value: '1M,10M', label: '$1M-$10M' },
    { value: '10M,50M', label: '$10M-$50M' },
    { value: '50M,100M', label: '$50M-$100M' },
    { value: '100M,500M', label: '$100M-$500M' },
    { value: '500M,1B', label: '$500M-$1B' },
    { value: '1B,max', label: '$1B+' }
  ];

  // Common locations for dropdown
  const commonLocations = [
    'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
    'France', 'Netherlands', 'Belgium', 'Spain', 'Italy', 'Switzerland',
    'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Austria',
    'Singapore', 'Hong Kong', 'Japan', 'India', 'China', 'Brazil',
    'Mexico', 'Argentina', 'South Africa', 'United Arab Emirates',
    'New Zealand', 'Poland', 'Czech Republic', 'Portugal', 'Greece'
  ];

  // Filter locations based on input
  const filteredLocations = locationInput
    ? commonLocations.filter(loc =>
        loc.toLowerCase().includes(locationInput.toLowerCase()) &&
        !searchParams.organizationLocations.includes(loc)
      )
    : commonLocations.filter(loc => !searchParams.organizationLocations.includes(loc));

  const handleInputChange = (field, value) => {
    setSearchParams(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMultiSelectChange = (field, value) => {
    setSearchParams(prev => {
      const currentValues = prev[field] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      return {
        ...prev,
        [field]: newValues
      };
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const validTypes = ['.csv', '.xlsx', '.txt'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (validTypes.includes(fileExtension)) {
        setUploadedFile(file);
        setError(null);
      } else {
        setError('Please upload a valid file (.csv, .xlsx, or .txt)');
        setUploadedFile(null);
      }
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Check if organization already exists in database for manual mode
      if (searchMode === 'manual') {
        const dbOrgs = await getAllOrganizations();
        
        // Check by domain if provided
        if (searchParams.organizationDomain) {
          const existingByDomain = dbOrgs.find(org =>
            org.domain && org.domain.toLowerCase() === searchParams.organizationDomain.toLowerCase()
          );
          
          if (existingByDomain) {
            setError(`Organization with domain "${searchParams.organizationDomain}" already exists in database (ID: ${existingByDomain.id})`);
            setIsLoading(false);
            return;
          }
        }
        
        // Check by name if provided
        if (searchParams.organizationName) {
          const existingByName = dbOrgs.find(org =>
            org.name && org.name.toLowerCase() === searchParams.organizationName.toLowerCase()
          );
          
          if (existingByName) {
            setError(`Organization with name "${searchParams.organizationName}" already exists in database (ID: ${existingByName.id})`);
            setIsLoading(false);
            return;
          }
        }
      }
      
      let requestBody;

      if (searchMode === 'file' && uploadedFile) {
        // File upload mode - read file content and send as JSON
        const fileContent = await readFileContent(uploadedFile);
        const fileExtension = uploadedFile.name.substring(uploadedFile.name.lastIndexOf('.')).toLowerCase();
        
        requestBody = {
          fileContent: fileContent,
          fileName: uploadedFile.name,
          fileType: fileExtension
        };
        
        console.log('Sending file to webhook:', N8N_FILE_WEBHOOK_URL);
        console.log('File details:', { fileName: uploadedFile.name, fileType: fileExtension });
        
        // Send file content to dedicated file webhook
        const response = await fetch(N8N_FILE_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle the response from n8n
        let organizations = [];
        
        if (data.organizations && Array.isArray(data.organizations)) {
          organizations = data.organizations;
        } else if (data.success && data.data) {
          organizations = Array.isArray(data.data) ? data.data : [data.data];
        } else if (Array.isArray(data)) {
          organizations = data;
        } else if (data.success !== false) {
          organizations = data.data ? [data.data] : [];
        }
        
        setSearchResults(organizations);
        
        // Save to database
        if (organizations.length > 0) {
          const imported = await importOrganizations(organizations);
          await loadDbOrganizations();
          console.log(`Imported ${imported} new organizations to database`);
        }
        
        setIsLoading(false);
        return;
      } else if (searchMode === 'manual') {
        // Manual search mode - name and/or domain with optional location
        if (!searchParams.organizationName && !searchParams.organizationDomain) {
          setError('Please provide at least organization name or domain');
          setIsLoading(false);
          return;
        }
        
        // If domain is provided, return only 1 result, otherwise use perPage
        const resultsPerPage = searchParams.organizationDomain ? 1 : searchParams.perPage;
        
        requestBody = {
          mode: 'manual',
          q_organization_name: searchParams.organizationName || "",
          organization_domain: searchParams.organizationDomain || "",
          organization_locations: searchParams.organizationLocations.map(loc => `"${loc}"`).join(', '),
          organizationNumEmployeesRanges: [],
          organizationIndustryTagIds: [],
          revenueRange: "",
          page: 1,
          per_page: resultsPerPage,
          fileData: "",
          fileName: "",
          fileType: ""
        };
      } else if (searchMode === 'filters') {
        // Filter-based search mode - Format for Apollo.io API
        const hasFilters = searchParams.organizationNumEmployeesRanges.length > 0 ||
                          searchParams.revenueRange.length > 0 ||
                          searchParams.organizationIndustryTagIds.length > 0 ||
                          searchParams.organizationLocations.length > 0;
        
        if (!hasFilters) {
          setError('Please select at least one filter');
          setIsLoading(false);
          return;
        }
        
        // Format request body to match Apollo.io API exactly
        // All array values must be properly quoted strings
        requestBody = {
          organization_num_employees_ranges: searchParams.organizationNumEmployeesRanges,
          organization_locations: searchParams.organizationLocations,
          q_organization_keyword_tags: searchParams.organizationIndustryTagIds
            .filter(tag => tag && tag.trim()),
          page: 1,
          per_page: searchParams.perPage || 10
        };

        // Add revenue range if selected (use first selected range)
        if (searchParams.revenueRange && searchParams.revenueRange.length > 0) {
          const [min, max] = searchParams.revenueRange[0].split(',');
          requestBody['revenue_range[min]'] = convertRevenueToNumber(min);
          requestBody['revenue_range[max]'] = convertRevenueToNumber(max);
        }
      }

      // Use different webhook URL for filter-based search
      const webhookUrl = searchMode === 'filters' ? N8N_FILTERS_WEBHOOK_URL : N8N_WEBHOOK_URL;
      
      console.log('Sending to webhook:', webhookUrl);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle the response from n8n - be more flexible with response format
      let organizations = [];
      
      if (data.organizations && Array.isArray(data.organizations)) {
        organizations = data.organizations;
      } else if (data.success && data.data) {
        organizations = Array.isArray(data.data) ? data.data : [data.data];
      } else if (Array.isArray(data)) {
        organizations = data;
      } else if (data.success !== false) {
        // If webhook returned success (or no explicit failure), treat as success even if format is different
        organizations = data.data ? [data.data] : [];
      }
      
      setSearchResults(organizations);
      
      // Save to database
      if (organizations.length > 0) {
        const imported = await importOrganizations(organizations);
        await loadDbOrganizations();
        console.log(`Imported ${imported} new organizations to database`);
      }
      
    } catch (err) {
      console.error('Search error:', err);
      setError(`Search failed: ${err.message}`);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to convert revenue strings to numbers for Apollo API
  const convertRevenueToNumber = (value) => {
    if (!value) return null;
    if (value === 'max') return null; // No upper limit
    
    const numValue = parseFloat(value);
    if (value.includes('B')) return numValue * 1000000000;
    if (value.includes('M')) return numValue * 1000000;
    return numValue;
  };

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target.result;
        
        if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
          // For CSV/TXT, send as text
          resolve(content);
        } else if (file.name.endsWith('.xlsx')) {
          // For XLSX, send as base64
          resolve(content.split(',')[1]); // Remove data:application/... prefix
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      if (file.name.endsWith('.xlsx')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleSaveToPipedrive = () => {
    updateWorkflowData('organizations', searchResults);
    alert(`${searchResults.length} organizations saved to workflow data. Ready to find people!`);
    onNext();
  };

  const handleRemoveOrganization = (id) => {
    setSearchResults(prev => prev.filter(org => org.id !== id));
  };

  const handleDeleteFromDb = async (id) => {
    if (confirm('Are you sure you want to delete this organization from the database?')) {
      await deleteOrganization(id);
      await loadDbOrganizations();
    }
  };

  // Handle Apollo organization selection
  const handleApolloToggle = (apolloId) => {
    setSelectedApolloOrgs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(apolloId)) {
        newSet.delete(apolloId);
      } else {
        newSet.add(apolloId);
      }
      return newSet;
    });
  };

  // Handle Apollo decisions
  const handleApolloDecisions = async (action) => {
    if (selectedApolloOrgs.size === 0) {
      alert('Please select at least one organization');
      return;
    }

    const decisions = Array.from(selectedApolloOrgs).map(apolloId => ({
      apollo_id: apolloId,
      action: action
    }));

    try {
      const response = await fetch('http://localhost:3001/api/apollo/decisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decisions })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          alert(`${action === 'accept' ? 'Accepted' : 'Declined'} ${selectedApolloOrgs.size} organizations`);
          
          // If accepted, show the accepted organizations
          if (action === 'accept' && data.accepted && data.accepted.length > 0) {
            setSearchResults(data.accepted);
          }
          
          // Reload pending list and clear selection
          await loadApolloPendingOrgs();
          await loadDbOrganizations();
          setSelectedApolloOrgs(new Set());
        }
      }
    } catch (err) {
      console.error('Failed to process Apollo decisions:', err);
      alert('Failed to process decisions');
    }
  };

  const handleModeChange = (mode) => {
    setSearchMode(mode);
    setError(null);
    // Clear file when switching modes
    if (mode !== 'file') {
      setUploadedFile(null);
    }
  };

  const handleAddLocation = (location) => {
    const newLocs = [...searchParams.organizationLocations, location];
    handleInputChange('organizationLocations', newLocs);
    setLocationInput('');
    setShowLocationDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (locationInputRef.current && !locationInputRef.current.contains(event.target)) {
        setShowLocationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="organization-search">
      <div className="section-header">
        <h2>🏢 Find Organizations</h2>
      </div>

      {/* Apollo Pending Organizations */}
      {apolloPendingOrgs.length > 0 && (
        <div className="apollo-pending-orgs" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#fff3cd', borderRadius: '8px', border: '2px solid #ffc107' }}>
          <h3 style={{ color: '#856404', marginBottom: '1rem' }}>🔍 Apollo Search Results - Review & Accept ({apolloPendingOrgs.length})</h3>
          <p style={{ color: '#856404', marginBottom: '1rem' }}>Select organizations to accept or decline from Apollo search results:</p>
          
          <div className="apollo-table-container" style={{ overflowX: 'auto' }}>
            <table className="pipedrive-table" style={{ width: '100%', backgroundColor: 'white' }}>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={selectedApolloOrgs.size === apolloPendingOrgs.length && apolloPendingOrgs.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedApolloOrgs(new Set(apolloPendingOrgs.map(org => org.apollo_id)));
                        } else {
                          setSelectedApolloOrgs(new Set());
                        }
                      }}
                    />
                  </th>
                  <th>Name</th>
                  <th>Website</th>
                  <th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {apolloPendingOrgs.map(org => (
                  <tr key={org.apollo_id} style={{ backgroundColor: selectedApolloOrgs.has(org.apollo_id) ? '#e7f3ff' : 'white' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedApolloOrgs.has(org.apollo_id)}
                        onChange={() => handleApolloToggle(org.apollo_id)}
                      />
                    </td>
                    <td><strong>{org.name}</strong></td>
                    <td>
                      {org.website_url ? (
                        <a href={org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`} target="_blank" rel="noopener noreferrer">
                          {org.website_url}
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      {org.linkedin_url ? (
                        <a href={org.linkedin_url.startsWith('http') ? org.linkedin_url : `https://${org.linkedin_url}`} target="_blank" rel="noopener noreferrer">
                          LinkedIn
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-success"
              onClick={() => handleApolloDecisions('accept')}
              disabled={selectedApolloOrgs.size === 0}
              style={{ padding: '0.75rem 1.5rem' }}
            >
              ✅ Accept Selected ({selectedApolloOrgs.size})
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleApolloDecisions('decline')}
              disabled={selectedApolloOrgs.size === 0}
              style={{ padding: '0.75rem 1.5rem' }}
            >
              ❌ Decline Selected ({selectedApolloOrgs.size})
            </button>
          </div>
        </div>
      )}

      {/* Pipedrive Organizations */}
      {pipedriveOrganizations.length > 0 && (
        <div className="pipedrive-orgs">
          <h3>📋 Organizations in Pipedrive ({pipedriveOrganizations.length})</h3>
          <div className="pipedrive-table-container">
            <table className="pipedrive-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Website</th>
                  <th>LinkedIn</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {pipedriveOrganizations.map(org => (
                  <tr key={org.id}>
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
                          {org.linkedin}
                        </a>
                      ) : '-'}
                    </td>
                    <td>{org.people_count !== undefined ? org.people_count : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Search Mode Toggle */}
      
      <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
        <h3>Choose your search method: manual entry, file upload, or filter-based search</h3>
      </div>

      <div className="search-mode-toggle">
        <button 
          className={`mode-btn ${searchMode === 'manual' ? 'active' : ''}`}
          onClick={() => handleModeChange('manual')}
        >
          ✍️ Manual Entry
        </button>
        <button 
          className={`mode-btn ${searchMode === 'file' ? 'active' : ''}`}
          onClick={() => handleModeChange('file')}
        >
          📁 Upload File
        </button>
        <button 
          className={`mode-btn ${searchMode === 'filters' ? 'active' : ''}`}
          onClick={() => handleModeChange('filters')}
        >
          🔍 Search by Filters
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="search-form">
        {searchMode === 'file' ? (
          <>
            {/* File Upload Section */}
            <div className="form-section">
              <h3>Upload Organization List</h3>
              <div className="file-upload-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.txt"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button 
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📎 Choose File
                </button>
                {uploadedFile && (
                  <div className="file-info">
                    <span className="file-name">✓ {uploadedFile.name}</span>
                    <button 
                      className="btn-icon"
                      onClick={() => setUploadedFile(null)}
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <p className="file-help">
                  Supported formats: CSV, XLSX, TXT<br/>
                  <small><strong>Required columns:</strong> name (optional), domain (mandatory)</small><br/>
                  <small>File should contain 2 columns: name and domain. Only domain is required.</small>
                </p>
              </div>
            </div>
          </>
        ) : searchMode === 'manual' ? (
          <>
            {/* Manual Search - Name/Domain with optional Location - Compact Layout */}
            <div className="form-section compact">
              <h3>Organization Details</h3>
              <div className="form-grid-compact">
                <div className="form-group">
                  <label>Organization Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Acme Corporation"
                    value={searchParams.organizationName}
                    onChange={(e) => handleInputChange('organizationName', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Domain</label>
                  <input
                    type="text"
                    placeholder="e.g., acme.com"
                    value={searchParams.organizationDomain}
                    onChange={(e) => handleInputChange('organizationDomain', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Results Per Page</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="10"
                    value={searchParams.perPage || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        handleInputChange('perPage', '');
                      } else {
                        const num = parseInt(value);
                        if (!isNaN(num) && num >= 1 && num <= 50) {
                          handleInputChange('perPage', num);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '' || parseInt(e.target.value) < 1) {
                        handleInputChange('perPage', 10);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="form-group location-section">
                <label>Location (Optional)</label>
                <div className="location-tags">
                  {searchParams.organizationLocations.map((loc, idx) => (
                    <span key={idx} className="location-tag">
                      {loc}
                      <button
                        className="tag-remove"
                        onClick={() => {
                          const newLocs = searchParams.organizationLocations.filter((_, i) => i !== idx);
                          handleInputChange('organizationLocations', newLocs);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div ref={locationInputRef} style={{ position: 'relative', width: '100%' }}>
                  <input
                    type="text"
                    placeholder="Type or select location (e.g., Belgium)"
                    value={locationInput}
                    onChange={(e) => {
                      setLocationInput(e.target.value);
                      setShowLocationDropdown(true);
                    }}
                    onFocus={() => setShowLocationDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && locationInput.trim()) {
                        e.preventDefault();
                        const newLocs = [...searchParams.organizationLocations, locationInput.trim()];
                        handleInputChange('organizationLocations', newLocs);
                        setLocationInput('');
                        setShowLocationDropdown(false);
                      } else if (e.key === 'Escape') {
                        setShowLocationDropdown(false);
                      }
                    }}
                  />
                  {showLocationDropdown && filteredLocations.length > 0 && (
                    <div className="location-dropdown">
                      {filteredLocations.slice(0, 10).map((loc, idx) => (
                        <div
                          key={idx}
                          className="location-dropdown-item"
                          onClick={() => handleAddLocation(loc)}
                        >
                          {loc}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Filter-based Search - Compact Layout */}
            <div className="form-section compact">
              <h3>Search by Company Characteristics</h3>
              
              <div className="filters-grid">
                {/* Company Size */}
                <div className="filter-group">
                  <label className="filter-label">Company Size</label>
                  <div className="checkbox-grid">
                    {employeeRanges.map(range => (
                      <label key={range.value} className="checkbox-label compact">
                        <input
                          type="checkbox"
                          checked={searchParams.organizationNumEmployeesRanges.includes(range.value)}
                          onChange={() => handleMultiSelectChange('organizationNumEmployeesRanges', range.value)}
                        />
                        <span>{range.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Revenue Range */}
                <div className="filter-group">
                  <label className="filter-label">Revenue Range</label>
                  <div className="checkbox-grid">
                    {revenueRanges.map(range => (
                      <label key={range.value} className="checkbox-label compact">
                        <input
                          type="radio"
                          name="revenueRange"
                          checked={searchParams.revenueRange[0] === range.value}
                          onChange={() => handleInputChange('revenueRange', [range.value])}
                        />
                        <span>{range.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Results Per Page */}
              <div className="form-group" style={{ marginTop: '1rem', maxWidth: '200px' }}>
                <label className="filter-label">Results Per Page</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  placeholder="10"
                  className="input-compact"
                  value={searchParams.perPage || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      handleInputChange('perPage', '');
                    } else {
                      const num = parseInt(value);
                      if (!isNaN(num) && num >= 1 && num <= 50) {
                        handleInputChange('perPage', num);
                      }
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '' || parseInt(e.target.value) < 1) {
                      handleInputChange('perPage', 10);
                    }
                  }}
                />
              </div>

              {/* Location */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="filter-label">Location</label>
                <div className="location-tags">
                  {searchParams.organizationLocations.map((loc, idx) => (
                    <span key={idx} className="location-tag">
                      {loc}
                      <button
                        className="tag-remove"
                        onClick={() => {
                          const newLocs = searchParams.organizationLocations.filter((_, i) => i !== idx);
                          handleInputChange('organizationLocations', newLocs);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div ref={locationInputRef} style={{ position: 'relative', width: '100%' }}>
                  <input
                    type="text"
                    placeholder="Type or select location (e.g., United States)"
                    value={locationInput}
                    onChange={(e) => {
                      setLocationInput(e.target.value);
                      setShowLocationDropdown(true);
                    }}
                    onFocus={() => setShowLocationDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && locationInput.trim()) {
                        e.preventDefault();
                        const newLocs = [...searchParams.organizationLocations, locationInput.trim()];
                        handleInputChange('organizationLocations', newLocs);
                        setLocationInput('');
                        setShowLocationDropdown(false);
                      } else if (e.key === 'Escape') {
                        setShowLocationDropdown(false);
                      }
                    }}
                  />
                  {showLocationDropdown && filteredLocations.length > 0 && (
                    <div className="location-dropdown">
                      {filteredLocations.slice(0, 10).map((loc, idx) => (
                        <div
                          key={idx}
                          className="location-dropdown-item"
                          onClick={() => handleAddLocation(loc)}
                        >
                          {loc}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Industry Tags */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="filter-label">Industry Tags</label>
                <small style={{ display: 'block', color: '#666', marginBottom: '0.5rem' }}>
                  Separate multiple tags with commas
                </small>
                <input
                  type="text"
                  placeholder="e.g., Technology, SaaS, E-commerce"
                  value={industryTagsInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setIndustryTagsInput(value);
                    if (value.includes(',')) {
                      const tags = value.split(',').map(s => s.trim()).filter(Boolean);
                      handleInputChange('organizationIndustryTagIds', tags);
                    } else {
                      handleInputChange('organizationIndustryTagIds', value.trim() ? [value.trim()] : []);
                    }
                  }}
                  onBlur={() => {
                    const tags = industryTagsInput.split(',').map(s => s.trim()).filter(Boolean);
                    handleInputChange('organizationIndustryTagIds', tags);
                    setIndustryTagsInput(tags.join(', '));
                  }}
                />
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button 
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={isLoading || (searchMode === 'file' && !uploadedFile)}
          >
            {isLoading ? '🔍 Searching...' : '🔍 Search Organizations'}
          </button>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            <h3>Search Results ({searchResults.length})</h3>
            <button 
              className="btn btn-success"
              onClick={handleSaveToPipedrive}
            >
              💾 Save to Pipedrive & Continue
            </button>
          </div>

          <div className="results-grid">
            {searchResults.map((org, idx) => (
              <div key={org.id || idx} className="organization-card">
                <div className="card-header">
                  <h4>{org.name}</h4>
                  <button 
                    className="btn-icon"
                    onClick={() => handleRemoveOrganization(org.id || idx)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
                <div className="card-body">
                  {org.domain && <p><strong>🌐 Domain:</strong> {org.domain}</p>}
                  {org.industry && <p><strong>🏭 Industry:</strong> {org.industry}</p>}
                  {org.employees && <p><strong>👥 Employees:</strong> {org.employees}</p>}
                  {org.location && <p><strong>📍 Location:</strong> {org.location}</p>}
                  {org.revenue && <p><strong>💰 Revenue:</strong> {org.revenue}</p>}
                  {org.description && <p className="description">{org.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export default OrganizationSearch;