import { useState, useEffect } from 'react';
import './EmailCampaign.css';

function EmailCampaign({ workflowData, updateWorkflowData, onNext, onPrevious }) {
  const [isSending, setIsSending] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [pendingEmails, setPendingEmails] = useState([]);
  const [processingEmails, setProcessingEmails] = useState(0);
  
  // n8n webhook URL
  const N8N_WEBHOOK_URL = 'https://aigeneers.app.n8n.cloud/webhook-test/send-leads-mails';

  // Fetch leads count and pending emails on mount
  useEffect(() => {
    fetchLeadsCount();
    fetchPendingEmails();
    
    // Poll for new emails every 5 seconds
    const interval = setInterval(() => {
      fetchPendingEmails();
      // Clear processing indicator if no emails are being generated
      if (processingEmails > 0 && pendingEmails.length === 0) {
        // Check if we've been waiting too long (30 seconds)
        const timeSinceStart = Date.now() - (window.campaignStartTime || 0);
        if (timeSinceStart > 30000) {
          setProcessingEmails(0);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [processingEmails, pendingEmails.length]);

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
        const emails = data.emails || [];
        setPendingEmails(emails);
        
        // If we have emails now, clear the processing indicator
        if (emails.length > 0 && processingEmails > 0) {
          setProcessingEmails(0);
        }
      }
    } catch (error) {
      console.error('Error fetching pending emails:', error);
    }
  };

  const handleApproveEmail = async (emailId) => {
    try {
      // Find the email data
      const email = pendingEmails.find(e => e.id === emailId);
      if (!email) {
        throw new Error('Email not found');
      }

      // Immediately remove from UI
      setPendingEmails(prev => prev.filter(e => e.id !== emailId));

      const response = await fetch('http://localhost:3001/api/emails/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: email.lead_id,
          decision: 'approve',
          email_data: email
        })
      });
      
      if (response.ok) {
        setLastRunResult({
          success: true,
          message: 'Email approved and sent to n8n!',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error approving email:', error);
      // Re-fetch to restore state on error
      await fetchPendingEmails();
      setLastRunResult({
        success: false,
        message: `Failed to approve email: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleDeclineEmail = async (emailId) => {
    try {
      // Find the email data
      const email = pendingEmails.find(e => e.id === emailId);
      if (!email) {
        throw new Error('Email not found');
      }

      // Immediately remove from UI
      setPendingEmails(prev => prev.filter(e => e.id !== emailId));

      const response = await fetch('http://localhost:3001/api/emails/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: email.lead_id,
          decision: 'decline',
          email_data: email
        })
      });
      
      if (response.ok) {
        setLastRunResult({
          success: true,
          message: 'Email declined and notification sent to n8n!',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error declining email:', error);
      // Re-fetch to restore state on error
      await fetchPendingEmails();
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
      
      // Set processing count and timestamp
      setProcessingEmails(leads.length);
      window.campaignStartTime = Date.now();
      
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
          message: `Email campaign workflow started! AI is generating ${leads.length} personalized emails...`,
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
      setProcessingEmails(0);
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
        <div className="workflow-summary">
          <div className="summary-item">
            <span className="summary-icon">🤖</span>
            <div className="summary-content">
              <strong>AI-Powered Workflow</strong>
              <p>Processes {leadsCount} leads • Generates personalized emails • Updates labels automatically</p>
            </div>
          </div>
          <div className="summary-item">
            <span className="summary-icon">📋</span>
            <div className="summary-content">
              <strong>Email Stages</strong>
              <p>Introduction → Follow-up → Bump → Final goodbye</p>
            </div>
          </div>
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

        {/* Processing indicator */}
        {processingEmails > 0 && pendingEmails.length === 0 && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <p>🤖 AI is generating {processingEmails} personalized emails...</p>
          </div>
        )}

        {/* Pending emails for review */}
        {pendingEmails.length > 0 && (
          <div className="pending-emails-container">
            <div className="pending-header">
              <h3>📬 Pending Emails ({pendingEmails.length})</h3>
              <p>Review and approve emails before sending</p>
            </div>
            
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

        {pendingEmails.length === 0 && processingEmails === 0 && (
          <div className="no-emails-message">
            <p>📭 No pending emails. Start a campaign to generate emails for review.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailCampaign;