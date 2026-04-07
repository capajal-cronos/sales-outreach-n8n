import { useState, useEffect } from 'react';
import './EmailCampaign.css';

function EmailCampaign({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [isSending, setIsSending] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [pendingEmails, setPendingEmails] = useState([]);
  
  // n8n webhook URL
  const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook-test/send-leads-mails';

  // Fetch leads count and pending emails on mount
  useEffect(() => {
    fetchLeadsCount();
    fetchPendingEmails();
    
    // Poll for new emails every 5 seconds
    const interval = setInterval(fetchPendingEmails, 5000);
    return () => clearInterval(interval);
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

  const fetchPendingEmails = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/email-queue/pending');
      if (response.ok) {
        const data = await response.json();
        setPendingEmails(data.emails || []);
      }
    } catch (error) {
      console.error('Error fetching pending emails:', error);
    }
  };

  const handleApproveEmail = async (emailId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/email-queue/${emailId}/approve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the pending emails list
        await fetchPendingEmails();
        setLastRunResult({
          success: true,
          message: 'Email approved successfully!',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error approving email:', error);
      setLastRunResult({
        success: false,
        message: `Failed to approve email: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleDeclineEmail = async (emailId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/email-queue/${emailId}/decline`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the pending emails list
        await fetchPendingEmails();
        setLastRunResult({
          success: true,
          message: 'Email declined successfully!',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error declining email:', error);
      setLastRunResult({
        success: false,
        message: `Failed to decline email: ${error.message}`,
        timestamp: new Date().toISOString()
      });
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
          message: `Email campaign workflow started! Generated emails will appear in the queue below for review.`,
          timestamp: new Date().toISOString()
        });
        // Refresh pending emails after a short delay to allow n8n to process
        setTimeout(fetchPendingEmails, 2000);
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
        <p>Trigger the automated email campaign workflow and review generated emails</p>
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
            <li>Adds emails to the queue for your review</li>
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

        {/* Pending emails for review */}
        {pendingEmails.length > 0 && (
          <div className="pending-emails-container">
            <h3>📬 Pending Emails for Review ({pendingEmails.length})</h3>
            <p className="review-instructions">Review each email and approve or decline before sending.</p>
            
            <div className="emails-list">
              {pendingEmails.map((email) => (
                <div key={email.id} className="email-card pending">
                  <div className="email-header">
                    <span className="email-stage">{email.email_stage}</span>
                    <span className="email-time">
                      {new Date(email.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="email-details">
                    <p><strong>To:</strong> {email.first_name} ({email.email})</p>
                    <p><strong>Lead ID:</strong> {email.lead_id}</p>
                    <p><strong>Subject:</strong> {email.subject}</p>
                    <div className="email-body">
                      <strong>Body:</strong>
                      <pre>{email.body}</pre>
                    </div>
                  </div>
                  <div className="email-actions">
                    <button
                      className="btn btn-success"
                      onClick={() => handleApproveEmail(email.id)}
                    >
                      ✅ Approve & Send
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeclineEmail(email.id)}
                    >
                      ❌ Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingEmails.length === 0 && (
          <div className="no-emails-message">
            <p>📭 No pending emails. Start a campaign to generate emails for review.</p>
          </div>
        )}

        <div className="workflow-notes">
          <h4>📝 Notes:</h4>
          <ul>
            <li>Generated emails are added to a queue for your review</li>
            <li>Approve emails you want to send, decline those you don't</li>
            <li>The page automatically refreshes every 5 seconds to show new emails</li>
            <li>Lead labels will be automatically updated after sending approved emails</li>
            <li>Declined emails are marked but not sent</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default EmailCampaign;