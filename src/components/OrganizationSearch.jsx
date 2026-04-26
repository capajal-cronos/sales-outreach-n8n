import { useState, useRef, useEffect } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { N8N_ENDPOINTS } from '../config/n8n';
import './OrganizationSearch.css';

function OrganizationSearch({ workflowData, updateWorkflowData, onNext, workflowErrors = [], onDismissError }) {
  const [searchMode, setSearchMode] = useState('manual'); // 'manual', 'file', or 'filters'
  const [searchParams, setSearchParams] = useState({
    organizationName: '',
    organizationDomain: '',
    organizationNumEmployeesRanges: [],
    organizationLocations: [],
    organizationIndustryTagIds: [],
    revenueRange: [],
    perPage: 5,  
    maxPages: 4
  });

  // Helper function to clean domain URLs
  const cleanDomain = (domain) => {
    if (!domain) return '';
    
    let cleaned = domain.trim();
    
    // Remove protocol (http://, https://, etc.)
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = cleaned.replace(/^www\./i, '');
    
    // Remove trailing slashes and paths
    cleaned = cleaned.split('/')[0];
    
    // Remove port numbers if any
    cleaned = cleaned.split(':')[0];
    
    return cleaned.toLowerCase();
  };

  const [uploadedFile, setUploadedFile] = useState(null);
  const [parsedDomains, setParsedDomains] = useState([]); // domains extracted from file
  const [skippedDomains, setSkippedDomains] = useState([]); // domains already in Pipedrive
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [pipedriveOrganizations, setPipedriveOrganizations] = useState(workflowData.organizations || []);
  const [industryTagsInput, setIndustryTagsInput] = useState('');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [orgSort, setOrgSort] = useState('asc');

  const toggleOrgSort = () => setOrgSort(prev => prev === 'asc' ? 'desc' : 'asc');
  const [error, setError] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [apolloPendingOrgs, setApolloPendingOrgs] = useState([]);
  const [showApolloModal, setShowApolloModal] = useState(false);
  const [processingOrgId, setProcessingOrgId] = useState(null);
  const [sessionAcceptedOrgs, setSessionAcceptedOrgs] = useState([]); // Track organizations accepted in this session
  const [selectedApolloOrgs, setSelectedApolloOrgs] = useState(new Set());
  const [isWaitingForResults, setIsWaitingForResults] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success'|'error'|'warning', message: string }
  const notificationTimer = useRef(null);
  const waitingTimeoutRef = useRef(null);
  const domainPollRef = useRef(null);
  const fileInputRef = useRef(null);
  const locationInputRef = useRef(null);

  const N8N_WEBHOOK_URL = N8N_ENDPOINTS.organizations;
  const N8N_FILTERS_WEBHOOK_URL = N8N_ENDPOINTS.organizationFilters;
  const N8N_FILE_WEBHOOK_URL = N8N_ENDPOINTS.organizationsFile;
  const N8N_APOLLO_ACCEPTED_URL = N8N_ENDPOINTS.apolloAcceptedOrganizations;
  const PIPEDRIVE_API_KEY = import.meta.env.VITE_PIPEDRIVE_API_KEY;
  const ORG_APOLLO_ID_KEY = import.meta.env.VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY;

  // Initialize on mount
  useEffect(() => {
    async function init() {
      fetchPipedriveOrganizations(); // Always refresh in background
      loadApolloPendingOrgs();
    }
    init();
  }, []);

  // Update workflowData when pipedriveOrganizations changes.
  // Sync empty arrays too — otherwise the sidebar badge keeps showing
  // a stale count from localStorage after all orgs are deleted.
  useEffect(() => {
    updateWorkflowData('organizations', pipedriveOrganizations);
  }, [pipedriveOrganizations]);

  // Poll for new Apollo results every 5 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadApolloPendingOrgs(true); // Pass true to indicate polling
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [apolloPendingOrgs.length]);

  // Load pending Apollo organizations
  const loadApolloPendingOrgs = async (isPolling = false) => {
    try {
      const response = await fetch('http://localhost:3001/api/apollo/pending');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const newOrgs = data.data;
          
          // If polling and we have new organizations, show modal and reset session
          if (isPolling && newOrgs.length > apolloPendingOrgs.length) {
            setShowApolloModal(true);
            setIsWaitingForResults(false);
            if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
            // Clear session accepted organizations when new batch arrives
            setSessionAcceptedOrgs([]);
            setSelectedApolloOrgs(new Set(newOrgs.map(org => org.apollo_id)));
          }
          
          setApolloPendingOrgs(newOrgs);
        }
      }
    } catch (err) {
      console.error('Failed to load Apollo pending organizations:', err);
    }
  };

  // Fetch organizations from Pipedrive
  const fetchPipedriveOrganizations = async () => {
    try {
      // Fetch organizations with all fields
      const response = await fetch(
        `https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`
      );

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.data) {
          // Fetch detailed info for each organization to get website + apollo_id
          const detailedOrgs = await Promise.all(
            data.data.map(async (org) => {
              try {
                const detailResponse = await fetch(
                  `https://api.pipedrive.com/v1/organizations/${org.id}?api_token=${PIPEDRIVE_API_KEY}`
                );
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  if (detailData.success && detailData.data) {
                    const apolloId = ORG_APOLLO_ID_KEY ? detailData.data[ORG_APOLLO_ID_KEY] : undefined;
                    return { ...detailData.data, apollo_id: apolloId };
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch details for org ${org.id}:`, err);
              }
              return org;
            })
          );

          setPipedriveOrganizations(detailedOrgs);
        } else {
          console.error('Pipedrive: no organizations data in response');
        }
      } else {
        console.error('Pipedrive API error:', response.status);
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
    'Belgium', 'Netherlands', 'Luxembourg', 'Germany', 'France', 'United Kingdom',
    'Spain', 'Italy', 'Switzerland', 'Canada', 'Australia', 'United States',
    'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Austria',
    'Singapore', 'Hong Kong', 'Japan', 'India', 'China', 'Brazil',
    'Mexico', 'Argentina', 'United Arab Emirates', 'Albania',
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

  // Check if a string looks like a domain
  const looksLikeDomain = (str) => {
    if (!str || typeof str !== 'string') return false;
    const cleaned = str.trim().toLowerCase();
    if (!cleaned || cleaned.includes(' ') && !cleaned.includes('://')) return false;
    // Strip protocol/www to test the core
    const core = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split(':')[0];
    // Must have at least one dot and a TLD-like part
    const parts = core.split('.');
    if (parts.length < 2) return false;
    const tld = parts[parts.length - 1];
    return tld.length >= 2 && tld.length <= 12 && /^[a-z]+$/.test(tld);
  };

  // Parse a file and extract the domain column
  const parseFileForDomains = async (file) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    let rows = [];

    if (ext === '.csv') {
      rows = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            resolve(e.target.result.split(/\r?\n/).filter(line => line.trim()).map(line => line.split(/[,;\t]/)));
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    } else if (ext === '.xlsx') {
      rows = await readXlsxFile(file);
    }

    if (rows.length === 0) return [];

    // Find which column has domains — score each column
    const numCols = Math.max(...rows.map(r => r.length));
    let bestCol = 0;
    let bestScore = 0;

    // Check header row for hints first
    const headerRow = rows[0].map(c => String(c || '').toLowerCase().trim());
    const domainHeaders = ['domain', 'website', 'url', 'web', 'site', 'homepage'];
    const headerIdx = headerRow.findIndex(h => domainHeaders.some(dh => h.includes(dh)));
    if (headerIdx >= 0) {
      bestCol = headerIdx;
      bestScore = Infinity; // header match wins
    }

    if (bestScore === 0) {
      // No header match — count domain-like values per column
      for (let col = 0; col < numCols; col++) {
        let score = 0;
        for (let row = 0; row < rows.length; row++) {
          if (looksLikeDomain(String(rows[row][col] || ''))) score++;
        }
        if (score > bestScore) { bestScore = score; bestCol = col; }
      }
    }

    // Extract domains from the winning column, skip header if it's a label
    const startRow = looksLikeDomain(String(rows[0][bestCol] || '')) ? 0 : 1;
    const domains = [];
    const seen = new Set();
    for (let i = startRow; i < rows.length; i++) {
      const raw = String(rows[i][bestCol] || '').trim();
      if (!raw) continue;
      const domain = cleanDomain(raw);
      if (domain && !seen.has(domain)) {
        seen.add(domain);
        domains.push(domain);
      }
    }

    return domains;
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['.csv', '.xlsx'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(fileExtension)) {
      setError('Please upload a .csv or .xlsx file');
      setUploadedFile(null);
      setParsedDomains([]);
      setSkippedDomains([]);
      return;
    }

    setUploadedFile(file);
    setError(null);

    try {
      const allDomains = await parseFileForDomains(file);
      if (allDomains.length === 0) {
        setError('No domains found in this file');
        setParsedDomains([]);
        setSkippedDomains([]);
        return;
      }

      // Filter out domains already in Pipedrive
      const existingDomains = new Set(
        pipedriveOrganizations
          .map(org => cleanDomain(org.website || org.domain || ''))
          .filter(Boolean)
      );

      const newDomains = [];
      const skipped = [];
      for (const domain of allDomains) {
        if (existingDomains.has(domain)) {
          skipped.push(domain);
        } else {
          newDomains.push(domain);
        }
      }

      setParsedDomains(newDomains);
      setSkippedDomains(skipped);
    } catch (err) {
      setError('Failed to parse file: ' + err.message);
      setParsedDomains([]);
      setSkippedDomains([]);
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setIsWaitingForResults(false);
    if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
    setError(null);

    try {
      let requestBody;

      if (searchMode === 'file') {
        // File upload mode - send parsed domains
        if (parsedDomains.length === 0) {
          setError('No new domains to search. Upload a file with domains not already in Pipedrive.');
          setIsLoading(false);
          return;
        }

        const response = await fetch(N8N_FILE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: parsedDomains })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

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
        setIsLoading(false);
        return;
      } else if (searchMode === 'manual') {
        // Manual search mode - name and/or domain with optional location
        if (!searchParams.organizationName && !searchParams.organizationDomain) {
          setError('Please provide at least organization name or domain');
          setIsLoading(false);
          return;
        }

        // Check against organizations already in Pipedrive
        const cleanedDomain = cleanDomain(searchParams.organizationDomain);
        if (cleanedDomain) {
          const existingByDomain = pipedriveOrganizations.find(org => {
            const orgDomain = cleanDomain(org.website || org.domain || '');
            return orgDomain && orgDomain === cleanedDomain;
          });
          if (existingByDomain) {
            setError(`"${cleanedDomain}" already exists in Pipedrive (${existingByDomain.name})`);
            setIsLoading(false);
            return;
          }
        }
        if (searchParams.organizationName) {
          const existingByName = pipedriveOrganizations.find(org =>
            org.name && org.name.toLowerCase() === searchParams.organizationName.toLowerCase()
          );
          if (existingByName) {
            setError(`"${searchParams.organizationName}" already exists in Pipedrive`);
            setIsLoading(false);
            return;
          }
        }
        
        // If domain is provided, return only 1 result, otherwise use perPage
        const resultsPerPage = searchParams.organizationDomain ? 1 : searchParams.perPage;

        requestBody = {
          mode: 'manual',
          q_organization_name: searchParams.organizationName || "",
          organization_domain: cleanedDomain || "",
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

      // Fetch multiple pages to get more results
      const maxPages = searchParams.maxPages || 4;
      const perPage = searchParams.perPage || 25;
      let allOrganizations = [];

      for (let page = 1; page <= maxPages; page++) {
        // Update page number in request body
        const pageRequestBody = { ...requestBody, page, per_page: perPage };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pageRequestBody)
        });

        if (!response.ok) {
          console.error(`Apollo search failed on page ${page}: HTTP ${response.status}`);
          break;
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
          organizations = data.data ? [data.data] : [];
        }

        // If no results on this page, stop fetching
        if (organizations.length === 0) {
          break;
        }

        allOrganizations = allOrganizations.concat(organizations);

        // If we got fewer results than perPage, we've reached the end
        if (organizations.length < perPage) {
          break;
        }
      }

      setSearchResults(allOrganizations);

      if (allOrganizations.length === 0) {
        setIsWaitingForResults(true);
        if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
        if (domainPollRef.current) clearInterval(domainPollRef.current);

        const searchedDomain = searchMode === 'manual' ? cleanDomain(searchParams.organizationDomain) : null;
        const orgCountBefore = pipedriveOrganizations.length;

        // Domain searches add directly to Pipedrive without returning results to the frontend.
        // Poll the Pipedrive org list so we can detect when the org lands there.
        if (searchedDomain) {
          domainPollRef.current = setInterval(async () => {
            try {
              const res = await fetch(`https://api.pipedrive.com/v1/organizations?api_token=${PIPEDRIVE_API_KEY}&limit=500`);
              if (!res.ok) return;
              const data = await res.json();
              if (!data.success || !data.data) return;
              if (data.data.length > orgCountBefore) {
                clearInterval(domainPollRef.current);
                clearTimeout(waitingTimeoutRef.current);
                setIsWaitingForResults(false);
                await fetchPipedriveOrganizations();
                showNotification('success', 'Organization added to Pipedrive successfully.');
              }
            } catch { /* ignore */ }
          }, 3000);
        }

        waitingTimeoutRef.current = setTimeout(() => {
          if (domainPollRef.current) clearInterval(domainPollRef.current);
          setIsWaitingForResults(false);
          if (searchedDomain) {
            showNotification('warning', 'Timed out waiting for results. If the organization was added it will appear in the list above after a refresh.');
          } else {
            showNotification('warning', 'No organizations found. Check your search query and try again.');
          }
        }, 18000);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(`Search failed: ${err.message}`);
      setSearchResults([]);
      setIsWaitingForResults(false);
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


  const handleSaveToPipedrive = () => {
    updateWorkflowData('organizations', searchResults);
    showNotification('success', `${searchResults.length} organizations saved to workflow data. Ready to find people!`);
    onNext();
  };

  const handleRemoveOrganization = (id) => {
    setSearchResults(prev => prev.filter(org => org.id !== id));
  };

  const showNotification = (type, message, duration = 5000) => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification({ type, message });
    notificationTimer.current = setTimeout(() => setNotification(null), duration);
  };

  const resetSearchForm = () => {
    setSearchParams({
      organizationName: '',
      organizationDomain: '',
      organizationNumEmployeesRanges: [],
      organizationLocations: [],
      organizationIndustryTagIds: [],
      revenueRange: [],
      perPage: 5,
      maxPages: 4
    });
    setUploadedFile(null);
    setParsedDomains([]);
    setSkippedDomains([]);
    setIndustryTagsInput('');
    setLocationInput('');
    setSearchResults([]);
    setError(null);
  };

  const toggleOrgSelection = (apolloId) => {
    setSelectedApolloOrgs(prev => {
      const next = new Set(prev);
      if (next.has(apolloId)) next.delete(apolloId);
      else next.add(apolloId);
      return next;
    });
  };

  const selectAllApolloOrgs = () => {
    setSelectedApolloOrgs(new Set(apolloPendingOrgs.map(org => org.apollo_id)));
  };

  const deselectAllApolloOrgs = () => {
    setSelectedApolloOrgs(new Set());
  };

  const handleAcceptSelectedOrgs = async () => {
    if (selectedApolloOrgs.size === 0) return;
    setProcessingOrgId('batch');
    try {
      const decisions = apolloPendingOrgs.map(org => ({
        apollo_id: org.apollo_id,
        action: selectedApolloOrgs.has(org.apollo_id) ? 'accept' : 'decline'
      }));

      const response = await fetch('http://localhost:3001/api/apollo/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (data.accepted && data.accepted.length > 0) {
            const updatedSessionOrgs = [...sessionAcceptedOrgs, ...data.accepted];
            setSessionAcceptedOrgs(updatedSessionOrgs);
            setSearchResults(data.accepted);
            await handleSendAcceptedToN8n(true, updatedSessionOrgs);
          }
          await loadApolloPendingOrgs();
          setShowApolloModal(false);
          resetSearchForm();
        }
      }
    } catch (err) {
      console.error('Failed to process Apollo decisions:', err);
      showNotification('error', 'Failed to process decisions');
    } finally {
      setProcessingOrgId(null);
    }
  };

  const handleDeclineAllOrgs = async () => {
    setProcessingOrgId('batch');
    try {
      const decisions = apolloPendingOrgs.map(org => ({
        apollo_id: org.apollo_id,
        action: 'decline'
      }));

      const response = await fetch('http://localhost:3001/api/apollo/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions })
      });

      if (response.ok) {
        await loadApolloPendingOrgs();
        setShowApolloModal(false);
        resetSearchForm();
      }
    } catch (err) {
      console.error('Failed to decline organizations:', err);
    } finally {
      setProcessingOrgId(null);
    }
  };

  // Send accepted organizations to n8n
  const handleSendAcceptedToN8n = async (isAutomatic = false, orgsToSend = null) => {
    try {
      setIsLoading(true);

      // Use provided organizations or fall back to session state
      const acceptedOrgs = orgsToSend || sessionAcceptedOrgs;

      if (acceptedOrgs.length === 0) {
        if (!isAutomatic) {
          showNotification('warning', 'No accepted Apollo organizations to send');
        }
        return;
      }

      // Filter out organizations without domains - n8n enrichment requires a domain
      const orgsWithDomain = acceptedOrgs.filter(org => org.domain);
      const orgsWithoutDomain = acceptedOrgs.filter(org => !org.domain);

      if (orgsWithoutDomain.length > 0) {
        const names = orgsWithoutDomain.map(org => org.name).join(', ');
        showNotification('warning', `Skipped ${orgsWithoutDomain.length} org(s) without domain: ${names}`, 8000);
      }

      if (orgsWithDomain.length === 0) {
        setSessionAcceptedOrgs([]);
        return;
      }

      const payload = {
        organizations: orgsWithDomain,
        count: orgsWithDomain.length,
        timestamp: new Date().toISOString()
      };

      // Send to n8n webhook
      const response = await fetch(N8N_APOLLO_ACCEPTED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await response.text();
        showNotification('success', `Sent ${orgsWithDomain.length} organization(s) to n8n`);

        // Clear session accepted organizations after successful send
        setSessionAcceptedOrgs([]);
        setShowApolloModal(false);
      } else {
        const errorText = await response.text();
        throw new Error(`Failed to send to n8n: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (err) {
      console.error('Failed to send accepted organizations to n8n:', err);
      showNotification('error', `Failed to send organizations to n8n: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (mode) => {
    setSearchMode(mode);
    setError(null);
    // Clear file when switching modes
    if (mode !== 'file') {
      setUploadedFile(null);
      setParsedDomains([]);
      setSkippedDomains([]);
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (domainPollRef.current) clearInterval(domainPollRef.current);
      if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
    };
  }, []);

  return (
    <div className="organization-search">
      {notification && (
        <div className={`toast toast--${notification.type}`}>
          <span>{notification.message}</span>
          <button className="toast-close" onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      <div className="section-header">
        <h2>Find Organizations</h2>
        <p>Search Apollo for new organizations or manage existing ones from Pipedrive</p>
      </div>

      {/* Apollo Modal - checkbox selection like PeopleFinder */}
      {showApolloModal && apolloPendingOrgs.length > 0 && (
        <div className="modal-overlay" onClick={() => setShowApolloModal(false)}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Found {apolloPendingOrgs.length} organizations</h3>
              <button className="modal-close" onClick={() => setShowApolloModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Select organizations to save to Pipedrive.
              </p>
              <table className="pipedrive-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        title={selectedApolloOrgs.size === apolloPendingOrgs.length ? 'Deselect all' : 'Select all'}
                        checked={selectedApolloOrgs.size === apolloPendingOrgs.length && apolloPendingOrgs.length > 0}
                        onChange={e => e.target.checked ? selectAllApolloOrgs() : deselectAllApolloOrgs()}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th>Name</th>
                    <th>Website</th>
                    <th>LinkedIn</th>
                  </tr>
                </thead>
                <tbody>
                  {apolloPendingOrgs.map(org => {
                    const isSelected = selectedApolloOrgs.has(org.apollo_id);
                    return (
                      <tr
                        key={org.apollo_id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleOrgSelection(org.apollo_id)}
                      >
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOrgSelection(org.apollo_id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td><strong>{org.name}</strong></td>
                        <td>
                          {org.website_url ? (
                            <a
                              href={org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              {org.website_url}
                            </a>
                          ) : '-'}
                        </td>
                        <td>
                          {org.linkedin_url ? (
                            <a
                              href={org.linkedin_url.startsWith('http') ? org.linkedin_url : `https://${org.linkedin_url}`}
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
                {selectedApolloOrgs.size} of {apolloPendingOrgs.length} selected
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={handleDeclineAllOrgs} disabled={processingOrgId === 'batch'}>
                  Decline All
                </button>
                <button className="btn btn-primary" onClick={handleAcceptSelectedOrgs} disabled={processingOrgId === 'batch' || selectedApolloOrgs.size === 0}>
                  {processingOrgId === 'batch' ? 'Processing...' : `Accept ${selectedApolloOrgs.size === apolloPendingOrgs.length ? 'All' : selectedApolloOrgs.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apollo Pending Organizations - Inline Notification */}
      {!showApolloModal && apolloPendingOrgs.length > 0 && (
        <div className="apollo-pending-orgs" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#fff3cd', borderRadius: '8px', border: '2px solid #ffc107' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: '#856404', margin: 0 }}>Apollo Search Results - {apolloPendingOrgs.length} pending review</h3>
            <button
              onClick={() => { setShowApolloModal(true); setSelectedApolloOrgs(new Set(apolloPendingOrgs.map(org => org.apollo_id))); }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ffc107',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Open Review Modal
            </button>
          </div>
        </div>
      )}

      {/* Pipedrive Organizations */}
      {pipedriveOrganizations.length > 0 ? (
        <div className="pipedrive-orgs">
          <h3>Organizations in Pipedrive ({pipedriveOrganizations.length})</h3>
          <input
            type="text"
            className="filter-input"
            placeholder="Search organizations..."
            value={orgSearchQuery}
            onChange={e => setOrgSearchQuery(e.target.value)}
            style={{ marginBottom: '0.75rem', width: '100%', maxWidth: '320px' }}
          />
          <div className="pipedrive-table-container">
            <table className="pipedrive-table">
              <thead>
                <tr>
                  <th onClick={toggleOrgSort} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Name {orgSort === 'asc' ? '↑' : '↓'}
                  </th>
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
                }).toSorted((a, b) => {
                  const cmp = (a.name || '').localeCompare(b.name || '');
                  return orgSort === 'asc' ? cmp : -cmp;
                }).map(org => (
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
                          LinkedIn
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
      ) : (
        <div style={{
          padding: '2rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '2rem',
          border: '2px dashed #dee2e6'
        }}>
          <h3 style={{ color: '#6c757d', marginBottom: '0.5rem' }}>No Organizations Found</h3>
          <p style={{ color: '#6c757d', margin: 0 }}>
            No organizations or persons found in Pipedrive. Add some organizations to get started!
          </p>
        </div>
      )}

      {/* Search Mode Toggle */}
      
      <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
        <h3>Choose your search method</h3>
      </div>

      <div className="search-mode-toggle">
        <button 
          className={`mode-btn ${searchMode === 'manual' ? 'active' : ''}`}
          onClick={() => handleModeChange('manual')}
        >
          Manual Entry
        </button>
        <button 
          className={`mode-btn ${searchMode === 'file' ? 'active' : ''}`}
          onClick={() => handleModeChange('file')}
        >
          Upload File
        </button>
        <button 
          className={`mode-btn ${searchMode === 'filters' ? 'active' : ''}`}
          onClick={() => handleModeChange('filters')}
        >
          Search by Filters
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="search-form">
        {searchMode === 'file' ? (
          <>
            {/* File Upload Section */}
            <div className="form-section">
              <h3>Upload Domains</h3>
              <p className="form-section-hint">We'll auto-detect the domain column from your file</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />

              {!uploadedFile ? (
                <div
                  className={`file-dropzone${isDragging ? ' dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                      if (['.csv', '.xlsx'].includes(ext)) {
                        // Trigger the same parsing flow
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        fileInputRef.current.files = dt.files;
                        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                      } else {
                        setError('Please upload a .csv or .xlsx file');
                      }
                    }
                  }}
                >
                  <div className="dropzone-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="12" y2="12"/>
                      <line x1="15" y1="15" x2="12" y2="12"/>
                    </svg>
                  </div>
                  <span className="dropzone-label">Drop your file here or <span className="dropzone-browse">browse</span></span>
                  <span className="dropzone-formats">.csv or .xlsx</span>
                </div>
              ) : (
                <div className="file-attached">
                  <div className="file-attached-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="file-attached-details">
                    <span className="file-attached-name">{uploadedFile.name}</span>
                    <span className="file-attached-meta">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    className="file-attached-remove"
                    onClick={() => {
                      setUploadedFile(null);
                      setParsedDomains([]);
                      setSkippedDomains([]);
                      fileInputRef.current.value = '';
                    }}
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              )}

              {uploadedFile && (parsedDomains.length > 0 || skippedDomains.length > 0) && (
                <div className="parsed-domains-summary">
                  <div className="domain-count-row">
                    <span className="domain-count-new">{parsedDomains.length} new</span>
                    {skippedDomains.length > 0 && (
                      <span className="domain-count-skipped">{skippedDomains.length} skipped (in Pipedrive)</span>
                    )}
                  </div>
                  {parsedDomains.length > 0 && (
                    <div className="parsed-domain-list">
                      {parsedDomains.map((d, i) => (
                        <span key={i} className="domain-tag">{d}</span>
                      ))}
                    </div>
                  )}
                  {skippedDomains.length > 0 && (
                    <details className="skipped-details">
                      <summary>Show skipped</summary>
                      <div className="parsed-domain-list">
                        {skippedDomains.map((d, i) => (
                          <span key={i} className="domain-tag skipped">{d}</span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </>
        ) : searchMode === 'manual' ? (
          <>
            {/* Manual Search - Redesigned */}
            <div className="form-section compact search-filters-redesign">
              <div className="form-section">
                <h3>Organization Details</h3>
                <p className="form-section-hint">Enter a name or domain to search for</p>
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
                </div>
              </div>

              <div className="form-section">
                <div className="settings-row" style={{ gap: '2rem', alignItems: 'flex-start' }}>
                  <div className="setting-item" style={{ flex: 2 }}>
                    <h3>Location</h3>
                    <p className="form-section-hint">Type or select countries</p>
                    {searchParams.organizationLocations.length > 0 && (
                      <div className="pill-group" style={{ marginBottom: '0.5rem' }}>
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
                    )}
                    <div ref={locationInputRef} style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                      <input
                        type="text"
                        className="filter-input"
                        placeholder="Type or select location..."
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
                        style={{ width: '100%' }}
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
                  <div className="setting-item">
                    <h3>Results</h3>
                    <p className="form-section-hint">How many organizations to return</p>
                    <div className="limit-input-row">
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
                    <div className="setting-hint">max 50</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Filter-based Search - Redesigned */}
            <div className="form-section compact search-filters-redesign">
              <div className="form-section">
                <h3>Company Size</h3>
                <p className="form-section-hint">Select one or more employee ranges</p>
                <div className="pill-group">
                  {employeeRanges.map(range => (
                    <button
                      key={range.value}
                      type="button"
                      className={`pill-toggle${searchParams.organizationNumEmployeesRanges.includes(range.value) ? ' active' : ''}`}
                      onClick={() => handleMultiSelectChange('organizationNumEmployeesRanges', range.value)}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h3>Revenue Range</h3>
                <p className="form-section-hint">Pick a revenue bracket</p>
                <div className="pill-group">
                  {revenueRanges.map(range => (
                    <button
                      key={range.value}
                      type="button"
                      className={`pill-toggle${searchParams.revenueRange[0] === range.value ? ' active' : ''}`}
                      onClick={() => handleInputChange('revenueRange', searchParams.revenueRange[0] === range.value ? [] : [range.value])}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h3>Location</h3>
                <p className="form-section-hint">Type or select countries to target</p>
                {searchParams.organizationLocations.length > 0 && (
                  <div className="pill-group" style={{ marginBottom: '0.5rem' }}>
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
                )}
                <div ref={locationInputRef} style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Type or select location..."
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
                    style={{ width: '100%' }}
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

              <div className="form-section">
                <h3>Industry Tags</h3>
                <p className="form-section-hint">Separate multiple tags with commas</p>
                <div className="form-group">
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

              <div className="form-section">
                <h3>Results</h3>
                <p className="form-section-hint">How many organizations to return</p>
                <div className="settings-row">
                  <div className="setting-item">
                    <div className="limit-input-row">
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
                    <div className="setting-hint">max 50</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

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
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={isLoading || isWaitingForResults || (searchMode === 'file' && parsedDomains.length === 0)}
          >
            {isLoading || isWaitingForResults ? 'Searching...' : 'Search Organizations'}
          </button>
        </div>

      </div>

    </div>
  );
}

export default OrganizationSearch;