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
  .replace(/â\x80\x8B/g, '')      // zero-width space
  .replace(/â\x80\x8C/g, '')      // zero-width non-joiner
  .replace(/â\x80\x99/g, "'")     // right single quote
  .replace(/â\x80\x9C/g, '"')     // left double quote
  .replace(/â\x80\x9D/g, '"')     // right double quote
  .replace(/â\x80\x93/g, '-')     // en dash
  .replace(/â\x80\x94/g, '-')     // em dash
  .replace(/â\x80\xAF/g, ' ')     // narrow no-break space (full mojibake)
  .replace(/â\xAF/g, ' ')          // narrow no-break space (middle byte stripped)
  .replace(/Ã©/g, 'é')
  .replace(/Ã\xA8/g, 'è')
  .replace(/Ã /g, 'à');

const lines = body.split('\n');

// Find the "On ... wrote:" separator line
const sepIdx = lines.findIndex(l => /^On .{0,400}?wrote:\s*$/i.test(l.trim()));

// Reply = everything before the separator
const replyLines = sepIdx >= 0 ? lines.slice(0, sepIdx) : lines.filter(l => !l.trim().startsWith('>'));
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
