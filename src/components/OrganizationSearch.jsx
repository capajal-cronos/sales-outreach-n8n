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
    revenueRange: '',
    perPage: 5
  });

  const [uploadedFile, setUploadedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState([]);
  const [dbOrganizations, setDbOrganizations] = useState([]);
  const [dbStats, setDbStats] = useState({ total: 0, processed: 0, unprocessed: 0, errors: 0 });
  const [error, setError] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const fileInputRef = useRef(null);

  // Get configuration from environment variables
  const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;

  // Initialize database and load organizations on mount
  useEffect(() => {
    async function init() {
      await initDatabase();
      loadDbOrganizations();
      fetchPipedriveOrganizations();
    }
    init();
  }, []);

  // Load organizations from database
  const loadDbOrganizations = async () => {
    const orgs = await getAllOrganizations();
    setDbOrganizations(orgs);
    const stats = await getStatistics();
    setDbStats(stats);
  };

  // Fetch organizations from Pipedrive
  const fetchPipedriveOrganizations = async () => {
    try {
      const response = await fetch(
        `https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setPipedriveOrganizations(data.data);
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
      let requestBody;

      if (searchMode === 'file' && uploadedFile) {
        // File upload mode - read file and send data
        const fileContent = await readFileContent(uploadedFile);
        requestBody = {
          mode: 'file',
          fileData: fileContent,
          fileName: uploadedFile.name,
          fileType: uploadedFile.name.substring(uploadedFile.name.lastIndexOf('.')).toLowerCase(),
          q_organization_name: "",
          organization_locations: searchParams.organizationLocations.map(loc => `"${loc}"`).join(', '),
          organizationNumEmployeesRanges: [],
          organizationIndustryTagIds: [],
          revenueRange: "",
          page: 1,
          per_page: searchParams.perPage
        };
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
        // Filter-based search mode
        const hasFilters = searchParams.organizationNumEmployeesRanges.length > 0 ||
                          searchParams.revenueRange ||
                          searchParams.organizationIndustryTagIds.length > 0 ||
                          searchParams.organizationLocations.length > 0;
        
        if (!hasFilters) {
          setError('Please select at least one filter');
          setIsLoading(false);
          return;
        }
        
        requestBody = {
          mode: 'filters',
          q_organization_name: "",
          organization_domain: "",
          organization_locations: searchParams.organizationLocations.map(loc => `"${loc}"`).join(', '),
          organizationNumEmployeesRanges: searchParams.organizationNumEmployeesRanges || [],
          organizationIndustryTagIds: searchParams.organizationIndustryTagIds || [],
          revenueRange: searchParams.revenueRange || "",
          page: 1,
          per_page: searchParams.perPage,
          fileData: "",
          fileName: "",
          fileType: ""
        };
      }

      console.log('Sending to webhook:', requestBody);
      
      const response = await fetch(N8N_WEBHOOK_URL, {
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

  const handleModeChange = (mode) => {
    setSearchMode(mode);
    setError(null);
    // Clear file when switching modes
    if (mode !== 'file') {
      setUploadedFile(null);
    }
  };

  return (
    <div className="organization-search">
      <div className="section-header">
        <h2>🏢 Find Organizations</h2>
        <p>Choose your search method: manual entry, file upload, or filter-based search</p>
      </div>

      {/* Database Statistics */}
      {dbStats.total > 0 && (
        <div className="db-stats">
          <h3>📊 Database Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{dbStats.total}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{dbStats.unprocessed}</span>
              <span className="stat-label">Unprocessed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{dbStats.processed}</span>
              <span className="stat-label">Processed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{dbStats.errors}</span>
              <span className="stat-label">Errors</span>
            </div>
          </div>
        </div>
      )}

      {/* Pipedrive Organizations */}
      {pipedriveOrganizations.length > 0 && (
        <div className="pipedrive-orgs">
          <h3>📋 Organizations in Pipedrive ({pipedriveOrganizations.length})</h3>
          <div className="results-grid">
            {pipedriveOrganizations.slice(0, 6).map(org => (
              <div key={org.id} className="organization-card pipedrive-card">
                <div className="card-header">
                  <h4>{org.name}</h4>
                  <span className="badge">Pipedrive</span>
                </div>
                <div className="card-body">
                  {org.address && <p><strong>📍 Address:</strong> {org.address}</p>}
                  {org.owner_id && <p><strong>👤 Owner ID:</strong> {org.owner_id.name}</p>}
                  {org.people_count !== undefined && <p><strong>👥 People:</strong> {org.people_count}</p>}
                </div>
              </div>
            ))}
          </div>
          {pipedriveOrganizations.length > 6 && (
            <p className="show-more">+ {pipedriveOrganizations.length - 6} more organizations in Pipedrive</p>
          )}
        </div>
      )}

      {/* Search Mode Toggle */}
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
                  <small><strong>Required columns:</strong> name_company, website_company, processed</small><br/>
                  <small>The 'processed' column can contain 'yes' or 'error' to skip already processed companies</small>
                </p>
              </div>
            </div>
          </>
        ) : searchMode === 'manual' ? (
          <>
            {/* Manual Search - Name/Domain with optional Location */}
            <div className="form-section">
              <h3>Organization Details</h3>
              <p className="section-description">Provide organization name and/or domain. Location is optional.</p>
              <div className="form-row">
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
                  <small>If domain is provided, only 1 result will be returned</small>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Location (Optional)</h3>
              <div className="form-group">
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
                <input
                  type="text"
                  placeholder="Type location and press Enter (e.g., Belgium)"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && locationInput.trim()) {
                      e.preventDefault();
                      const newLocs = [...searchParams.organizationLocations, locationInput.trim()];
                      handleInputChange('organizationLocations', newLocs);
                      setLocationInput('');
                    }
                  }}
                />
                <small>Press Enter to add each location</small>
              </div>
            </div>

            <div className="form-section">
              <h3>Results Per Page</h3>
              <div className="form-group">
                <input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="10"
                  value={searchParams.perPage}
                  onChange={(e) => handleInputChange('perPage', parseInt(e.target.value) || 10)}
                />
                <small>Number of organizations to return (ignored if domain is provided)</small>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Filter-based Search */}
            <div className="form-section">
              <h3>Search by Company Characteristics</h3>
              <p className="section-description">Select filters to find organizations matching your criteria</p>
            </div>

            <div className="form-section">
              <h3>Company Size</h3>
              <div className="checkbox-group">
                {employeeRanges.map(range => (
                  <label key={range.value} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={searchParams.organizationNumEmployeesRanges.includes(range.value)}
                      onChange={() => handleMultiSelectChange('organizationNumEmployeesRanges', range.value)}
                    />
                    {range.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>Revenue Range</h3>
              <select
                value={searchParams.revenueRange}
                onChange={(e) => handleInputChange('revenueRange', e.target.value)}
                className="select-input"
              >
                <option value="">Select revenue range</option>
                {revenueRanges.map(range => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
            </div>

            <div className="form-section">
              <h3>Location</h3>
              <div className="form-group">
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
                <input
                  type="text"
                  placeholder="Type location and press Enter (e.g., United States)"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && locationInput.trim()) {
                      e.preventDefault();
                      const newLocs = [...searchParams.organizationLocations, locationInput.trim()];
                      handleInputChange('organizationLocations', newLocs);
                      setLocationInput('');
                    }
                  }}
                />
                <small>Press Enter to add each location</small>
              </div>
            </div>

            <div className="form-section">
              <h3>Industry Tags</h3>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="e.g., Technology, SaaS, E-commerce"
                  value={searchParams.organizationIndustryTagIds.join(', ')}
                  onChange={(e) => handleInputChange('organizationIndustryTagIds', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                />
                <small>Separate multiple industries with commas</small>
              </div>
            </div>

            <div className="form-section">
              <h3>Results Per Page</h3>
              <div className="form-group">
                <input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="10"
                  value={searchParams.perPage}
                  onChange={(e) => handleInputChange('perPage', parseInt(e.target.value) || 10)}
                />
                <small>Number of organizations to return</small>
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