import { useState, useEffect } from 'react';
import './EmailCampaign.css';

function EmailCampaign({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [isSending, setIsSending] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [leadsCount, setLeadsCount] = useState(0);
  
  // n8n webhook URL
  const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook-test/send-leads-mails';

  // Fetch leads count on mount
  useEffect(() => {
    fetchLeadsCount();
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

  const handleTriggerCampaign = async () => {
    setIsSending(true);
    setLastRunResult(null);

    try {
      console.log('Fetching leads from Pipedrive...');
      
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
          message: `Email campaign workflow started successfully! Processing ${leads.length} leads.`,
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

        <div className="workflow-notes">
          <h4>📝 Notes:</h4>
          <ul>
            <li>The workflow will process leads in batches</li>
            <li>You'll receive approval emails for each generated message</li>
            <li>Only approved emails will be sent</li>
            <li>Lead labels will be automatically updated after sending</li>
            <li>Check your email for approval requests</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default EmailCampaign;