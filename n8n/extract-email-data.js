const email = $input.first().json;

// Parse 'From' header into name + address
const fromRaw = email.from || '';
const m = fromRaw.match(/^(?:"?(.+?)"?\s+<(.+?)>|(.+))$/);
const fromName = m ? (m[1] || m[3] || '').trim() : fromRaw.trim();
const fromAddress = m ? (m[2] || m[3] || fromRaw).trim().toLowerCase() : fromRaw.trim().toLowerCase();

// Get plain-text body; fall back to HTML with tags stripped
let body = email.textPlain || '';
if (!body && email.textHtml) {
  body = email.textHtml.replace(/<[^>]*>/g, ' ');
}

// Normalise line endings
body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Fix UTF-8 mojibake BEFORE parsing structure
body = body
  .replace(/â\x80\x8B/g, '')
  .replace(/â\x80\x8C/g, '')
  .replace(/â\x80\x99/g, "'")
  .replace(/â\x80\x9C/g, '"')
  .replace(/â\x80\x9D/g, '"')
  .replace(/â\x80\x93/g, '-')
  .replace(/â\x80\x94/g, '-')
  .replace(/â\x80\xAF/g, ' ')
  .replace(/â\xAF/g, ' ')
  .replace(/Ã©/g, 'é')
  .replace(/Ã\xA8/g, 'è')
  .replace(/Ã /g, 'à');

const lines = body.split('\n');

// Cut points — anything that signals "end of reply, start of signature/quote".
// We stop at the FIRST one we hit so the snippet contains only fresh content.
const cutPatterns = [
  /^On\s.{0,400}?wrote:\s*$/i,                  // Gmail (EN)
  /^Op\s.{0,400}?schreef\s.{0,200}?:\s*$/i,     // Gmail (NL)
  /^Le\s.{0,400}?a\s+écrit\s*:\s*$/i,           // Gmail (FR)
  /^Am\s.{0,400}?schrieb\s.{0,200}?:\s*$/i,     // Gmail (DE)
  /^From:\s+.+/i,                                // Outlook reply header (EN)
  /^Van:\s+.+/i,                                 // Outlook reply header (NL)
  /^Von:\s+.+/i,                                 // Outlook reply header (DE)
  /^De\s*:\s+.+/i,                               // Outlook reply header (FR/ES/IT)
  /^-{3,}\s*Original Message\s*-{3,}/i,          // Classic Outlook
  /^\[photo\]\s*$/i,                             // Outlook mobile signature image
  /^Sent from my\s/i,                            // iOS/Android default signature
  /^--\s*$/,                                     // sigdash
  /^_{5,}\s*$/,                                  // underline separator
];

const sepIdx = lines.findIndex(l => {
  const t = l.trim();
  return cutPatterns.some(re => re.test(t));
});

// Reply = everything before the separator
const replyLines = sepIdx >= 0
  ? lines.slice(0, sepIdx)
  : lines.filter(l => !l.trim().startsWith('>'));

const snippet = replyLines
  .map(l => l.trim())
  .filter(Boolean)
  .join(' ')
  .trim()
  .substring(0, 300);

// Original = quoted lines after the separator, with > prefix stripped
const startSearch = sepIdx >= 0 ? sepIdx + 1 : 0;
const original = lines
  .slice(startSearch)
  .filter(l => l.trim().startsWith('>'))
  .map(l => l.replace(/^>\s?/, ''))
  .join('\n')
  .trim();

return [{
  json: {
    fromAddress,
    fromName,
    subject: email.subject || '',
    date: email.date || new Date().toISOString(),
    snippet,
    original
  }
}];
