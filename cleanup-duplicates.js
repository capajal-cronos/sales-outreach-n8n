import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'data/organizations.json');

async function cleanupDuplicates() {
  try {
    // Read the current database
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const orgs = JSON.parse(data);
    
    console.log(`Total organizations before cleanup: ${orgs.length}`);
    
    // Track unique organizations
    const uniqueOrgs = [];
    const seen = new Map(); // Key: apollo_id or domain, Value: organization
    
    for (const org of orgs) {
      let isDuplicate = false;
      let duplicateKey = '';
      
      // Check by apollo_id first (most reliable)
      if (org.apollo_id) {
        if (seen.has(`apollo:${org.apollo_id}`)) {
          isDuplicate = true;
          duplicateKey = `apollo_id: ${org.apollo_id}`;
        } else {
          seen.set(`apollo:${org.apollo_id}`, org);
        }
      }
      
      // Check by domain if no apollo_id or not duplicate yet
      if (!isDuplicate && org.domain && org.domain.trim()) {
        const normalizedDomain = org.domain.toLowerCase().trim();
        if (seen.has(`domain:${normalizedDomain}`)) {
          isDuplicate = true;
          duplicateKey = `domain: ${org.domain}`;
        } else {
          seen.set(`domain:${normalizedDomain}`, org);
        }
      }
      
      if (isDuplicate) {
        console.log(`Removing duplicate: ${org.name} (ID: ${org.id}, ${duplicateKey})`);
      } else {
        uniqueOrgs.push(org);
      }
    }
    
    console.log(`Total organizations after cleanup: ${uniqueOrgs.length}`);
    console.log(`Removed ${orgs.length - uniqueOrgs.length} duplicates`);
    
    // Reassign IDs to be sequential
    uniqueOrgs.forEach((org, index) => {
      org.id = index + 1;
    });
    
    // Write back to file
    await fs.writeFile(DB_FILE, JSON.stringify(uniqueOrgs, null, 2), 'utf-8');
    console.log('✅ Cleanup complete! Database saved.');
    
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    process.exit(1);
  }
}

cleanupDuplicates();