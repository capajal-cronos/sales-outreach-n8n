// Send each email individually to the frontend via SSE
// This replaces the "Create digest" node
// IMPORTANT: Set this node to "Run Once for Each Item" mode

const email = $input.item.json;

// Use n8n's built-in HTTP request method
const options = {
  method: 'POST',
  uri: 'http://localhost:3001/api/emails/stream-email',
  headers: {
    'Content-Type': 'application/json',
  },
  body: {
    lead_id: email.lead_id,
    email: email.email,
    first_name: email.first_name,
    email_stage: email.email_stage,
    subject: email.subject,
    body: email.body,
    timestamp: new Date().toISOString()
  },
  json: true
};

try {
  await $http.request(options);
} catch (error) {
  console.error('Failed to stream email:', error);
  // Continue processing even if streaming fails
}

// Pass through the email data for further processing
return {
  json: email
};