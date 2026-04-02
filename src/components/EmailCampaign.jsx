import { useState, useEffect, useRef } from 'react';
import './EmailCampaign.css';

function EmailCampaign({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [isSending, setIsSending] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [streamingEmails, setStreamingEmails] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef(null);
  
  // n8n webhook URL
  const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook-test/send-leads-mails';

  // Fetch leads count on mount
  useEffect(() => {
    fetchLeadsCount();
    
    // Cleanup SSE connection on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const fetchLeadsCount = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/leads');
      if (response.ok) {
        const data = await response.json();
        setLeadsCount(data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching leads count:', error);
    }
  };

  const startEmailStream = () => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear previous emails
    setStreamingEmails([]);
    setIsStreaming(true);

    // Create new SSE connection
    const eventSource = new EventSource('http://localhost:3001/api/emails/stream');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('Connected to email stream');
        } else if (data.type === 'email') {
          console.log('Received email:', data.data);
          setStreamingEmails(prev => [...prev, data.data]);
        } else if (data.type === 'complete') {
          console.log('Campaign complete');
          setIsStreaming(false);
          setLastRunResult({
            success: true,
            message: `Campaign completed! ${streamingEmails.length} emails processed.`,
            timestamp: new Date().toISOString()
          });
          eventSource.close();
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setIsStreaming(false);
      eventSource.close();
    };
  };

  const handleTriggerCampaign = async () => {
    setIsSending(true);
    setLastRunResult(null);

    try {
      console.log('Fetching leads from Pipedrive...');
      
      // Start listening to email stream
      startEmailStream();
      
      // First, fetch all leads from our API
      const leadsResponse = await fetch('http://localhost:3001/api/leads');
      if (!leadsResponse.ok) {
        throw new Error('Failed to fetch leads from Pipedrive');
      }
      
      const leadsData = await leadsResponse.json();
      const leads = leadsData.leads || [];
      
      console.log(`Sending ${leads.length} leads to n8n workflow:`, N8N_WEBHOOK_URL);
      
      // Send leads to n8n webhook
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger: 'manual',
          timestamp: new Date().toISOString(),
          leads: leads,
          totalLeads: leads.length
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('n8n workflow triggered successfully:', data);
        setLastRunResult({
          success: true,
          message: `Email campaign workflow started! Streaming ${leads.length} emails...`,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error triggering n8n workflow:', error);
      setLastRunResult({
        success: false,
        message: `Failed to trigger workflow: ${error.message}`,
        timestamp: new Date().toISOString()
      });
      setIsStreaming(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="email-campaign">
      <div className="section-header">
        <h2>📧 Email Campaign</h2>
        <p>Trigger the automated email campaign workflow</p>
      </div>

      <div className="campaign-info">
        <div className="info-card">
          <h3>🤖 Automated Email Workflow</h3>
          <p>This will trigger your n8n workflow that:</p>
          <ul>
            <li>Processes all leads from Pipedrive ({leadsCount} total)</li>
            <li>Filters leads based on their current label (excludes "last_mail" and "answered")</li>
            <li>Determines the next email stage for each lead</li>
            <li>Uses AI to write personalized emails based on the stage</li>
            <li>Sends approval emails for review</li>
            <li>Sends approved emails and updates lead labels</li>
          </ul>
        </div>

        <div className="info-card">
          <h3>📋 Email Stages</h3>
          <ul>
            <li><strong>no_label</strong> → first_mail (Introduction)</li>
            <li><strong>first_mail</strong> → second_mail (Follow-up)</li>
            <li><strong>second_mail</strong> → third_mail (Bump)</li>
            <li><strong>third_mail</strong> → last_mail (Final goodbye)</li>
            <li><strong>last_mail</strong> → Excluded from campaign</li>
            <li><strong>answered</strong> → Excluded from campaign</li>
          </ul>
        </div>

        <div className="campaign-trigger">
          <button
            className="btn btn-primary btn-large"
            onClick={handleTriggerCampaign}
            disabled={isSending || leadsCount === 0}
          >
            {isSending ? '⏳ Starting Workflow...' : `🚀 Start Email Campaign (${leadsCount} leads)`}
          </button>
          {leadsCount === 0 && (
            <p className="warning-text">⚠️ No leads found in Pipedrive. Add leads first.</p>
          )}
        </div>

        {lastRunResult && (
          <div className={`result-message ${lastRunResult.success ? 'success' : 'error'}`}>
            <div className="result-icon">
              {lastRunResult.success ? '✅' : '❌'}
            </div>
            <div className="result-content">
              <strong>{lastRunResult.success ? 'Success!' : 'Error'}</strong>
              <p>{lastRunResult.message}</p>
              <small>{new Date(lastRunResult.timestamp).toLocaleString()}</small>
            </div>
          </div>
        )}

        {/* Streaming emails display */}
        {isStreaming && (
          <div className="streaming-container">
            <h3>📨 Incoming Emails ({streamingEmails.length})</h3>
            <div className="streaming-status">
              <span className="streaming-indicator">🔴 Live</span>
              <span>Receiving emails in real-time...</span>
            </div>
          </div>
        )}

        {streamingEmails.length > 0 && (
          <div className="emails-list">
            {streamingEmails.map((email, index) => (
              <div key={index} className="email-card">
                <div className="email-header">
                  <span className="email-number">#{index + 1}</span>
                  <span className="email-stage">{email.email_stage}</span>
                  <span className="email-time">
                    {new Date(email.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="email-details">
                  <p><strong>To:</strong> {email.first_name} ({email.email})</p>
                  <p><strong>Subject:</strong> {email.subject}</p>
                  <div className="email-body">
                    <strong>Body:</strong>
                    <pre>{email.body}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="workflow-notes">
          <h4>📝 Notes:</h4>
          <ul>
            <li>Emails will stream to the frontend in real-time as they're generated</li>
            <li>You can see each email as it's being processed</li>
            <li>The workflow processes leads individually</li>
            <li>Lead labels will be automatically updated after sending</li>
            <li>No need to wait for all emails to be generated</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default EmailCampaign;