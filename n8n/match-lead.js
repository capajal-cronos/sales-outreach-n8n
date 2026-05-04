const imap = $('Extract Email Data').first().json;
const leadsResp = $input.first().json;
const leads = leadsResp.leads || [];

const fromAddress = (imap.fromAddress || '').trim().toLowerCase();
const fromName = (imap.fromName || '').trim().toLowerCase();
const fromDomain = fromAddress.split('@')[1] || '';

const emailsOf = (lead) => {
  const list = Array.isArray(lead['emails']) ? lead['emails'] : [];
  return list.length
    ? list.map(e => (e || '').trim().toLowerCase()).filter(Boolean)
    : [(lead.email || '').trim().toLowerCase()].filter(Boolean);
};

// 1. Exact email match against any address on the person record.
let matchingLead = leads.find(lead => emailsOf(lead).some(e => e === fromAddress));

// 2. Same-domain + name fallback. Catches corporate AD aliases like
//    bulsda1@cronos.be vs danny.buls@cronos.be — different mailboxes,
//    same person. Bounded to same domain to avoid name collisions.
if (!matchingLead && fromName && fromDomain) {
  matchingLead = leads.find(lead => {
    const sameDomain = emailsOf(lead).some(e => (e.split('@')[1] || '') === fromDomain);
    if (!sameDomain) return false;
    const title = (lead.title || '').toLowerCase().replace(/\s+lead\s*$/, '').trim();
    const personName = (lead.personName || '').trim().toLowerCase();
    return (title && title === fromName) || (personName && personName === fromName);
  });
}

// No match → bail out. Returning an empty array stops the workflow here
// without needing a "lead found?" IF node downstream.
if (!matchingLead) {
  return [];
}

const lead = matchingLead;
return [{ json: {
  lead_id:     lead.id,
  lead_title:  lead.title,
  stage:       lead.label || 'unknown',
  person_id:   lead.personId || null,
  person_name: lead.personName || imap.fromName,
  from:        imap.fromAddress,
  subject:     imap.subject,
  date:        imap.date,
  snippet:     imap.snippet
} }];
