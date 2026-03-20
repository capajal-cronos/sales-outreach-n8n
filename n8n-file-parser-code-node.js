// n8n Code Node - Parse CSV/TXT/XLSX file content and prepare for Apollo.io bulk_enrich
// This node processes the file content received from the webhook

const fileContent = $input.item.json.body.fileContent;
const fileType = $input.item.json.body.fileType;
const fileName = $input.item.json.body.fileName;

let organizations = [];

if (fileType === '.csv' || fileType === '.txt') {
  // Parse CSV/TXT content
  const lines = fileContent.split('\n').filter(line => line.trim());
  
  // Skip header row (first line)
  const dataLines = lines.slice(1);
  
  for (const line of dataLines) {
    // Split by comma, handling potential quotes
    const parts = line.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
    
    const name = parts[0] || '';
    const domain = parts[1] || '';
    
    // Only add if domain exists (mandatory field)
    if (domain) {
      organizations.push({
        name: name,
        domain: domain
      });
    }
  }
} else if (fileType === '.xlsx') {
  // For XLSX, the content comes as base64
  // n8n has a built-in "Spreadsheet File" node that's better for XLSX
  // But if you need to handle it here:
  throw new Error('XLSX files should be processed using n8n Spreadsheet File node. Please use CSV or TXT format, or add a Spreadsheet File node before this Code node.');
}

// Prepare the payload for Apollo.io bulk_enrich API
// According to Apollo.io docs, bulk_enrich expects an array of domains
const domains = organizations.map(org => org.domain);

// Return the data in the format Apollo.io expects
return {
  json: {
    domains: domains,
    // Keep original data for reference
    organizations: organizations,
    totalCount: organizations.length,
    fileName: fileName
  }
};