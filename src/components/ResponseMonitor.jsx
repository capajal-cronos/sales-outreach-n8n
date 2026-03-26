import { useState, useEffect } from 'react';
import './ResponseMonitor.css';

function ResponseMonitor({ workflowData, updateWorkflowData, onPrevious }) {
  const [responses, setResponses] = useState(workflowData.responses || []);
  const [filter, setFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Simulate fetching responses
  const handleRefresh = async () => {
    setIsRefreshing(true);

    setTimeout(() => {
      // Mock response data
      const mockResponses = workflowData.campaigns.flatMap(campaign => {
        const campaignLeads = workflowData.leads.filter(lead => 
          campaign.selectedLeads?.includes(lead.id)
        );

        return campaignLeads.slice(0, Math.floor(Math.random() * 3) + 1).map((lead, index) => ({
          id: `response-${campaign.id}-${lead.id}`,
          campaignId: campaign.id,
          campaignName: campaign.name,
          leadId: lead.id,
          leadName: lead.personName,
          leadEmail: lead.email,
          organization: lead.organization,
          type: index === 0 ? 'reply' : Math.random() > 0.5 ? 'open' : 'click',
          timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
          content: index === 0 ? 'Thanks for reaching out! I\'d be interested in learning more. Can we schedule a call?' : null,
          sentiment: index === 0 ? 'positive' : null
        }));
      });

      setResponses(mockResponses);
      updateWorkflowData('responses', mockResponses);
      setIsRefreshing(false);
    }, 1500);
  };

  useEffect(() => {
    if (responses.length === 0 && workflowData.campaigns.length > 0) {
      handleRefresh();
    }
  }, []);

  const getStats = () => {
    const totalEmails = workflowData.campaigns.reduce((sum, c) => sum + (c.emailsSent || 0), 0);
    const opens = responses.filter(r => r.type === 'open').length;
    const clicks = responses.filter(r => r.type === 'click').length;
    const replies = responses.filter(r => r.type === 'reply').length;
    const positiveReplies = responses.filter(r => r.type === 'reply' && r.sentiment === 'positive').length;

    return {
      totalEmails,
      opens,
      clicks,
      replies,
      positiveReplies,
      openRate: totalEmails > 0 ? ((opens / totalEmails) * 100).toFixed(1) : 0,
      clickRate: totalEmails > 0 ? ((clicks / totalEmails) * 100).toFixed(1) : 0,
      replyRate: totalEmails > 0 ? ((replies / totalEmails) * 100).toFixed(1) : 0
    };
  };

  const filteredResponses = filter === 'all' 
    ? responses 
    : responses.filter(r => r.type === filter);

  const stats = getStats();

  const getResponseIcon = (type) => {
    const icons = {
      open: '👁️',
      click: '🖱️',
      reply: '💬'
    };
    return icons[type] || '📧';
  };

  const getSentimentColor = (sentiment) => {
    const colors = {
      positive: '#10b981',
      neutral: '#f59e0b',
      negative: '#ef4444'
    };
    return colors[sentiment] || '#6b7280';
  };

  return (
    <div className="response-monitor">
      <div className="section-header">
        <h2>📊 Response Monitor</h2>
        <p>Track email engagement and responses</p>
      </div>

      {workflowData.campaigns.length === 0 ? (
        <div className="empty-state">
          <p>⚠️ No campaigns found. Please go back and create an email campaign first.</p>
          <button className="btn btn-secondary" onClick={onPrevious}>
            ← Back to Email Campaign
          </button>
        </div>
      ) : (
        <>
          <div className="monitor-controls">
            <button 
              className="btn btn-primary"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Data'}
            </button>
          </div>

          <div className="stats-dashboard">
            <div className="stats-row">
              <div className="stat-card large">
                <div className="stat-icon">📧</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.totalEmails}</div>
                  <div className="stat-label">Total Emails Sent</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">👁️</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.opens}</div>
                  <div className="stat-label">Opens</div>
                  <div className="stat-percentage">{stats.openRate}%</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🖱️</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.clicks}</div>
                  <div className="stat-label">Clicks</div>
                  <div className="stat-percentage">{stats.clickRate}%</div>
                </div>
              </div>

              <div className="stat-card highlight">
                <div className="stat-icon">💬</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.replies}</div>
                  <div className="stat-label">Replies</div>
                  <div className="stat-percentage">{stats.replyRate}%</div>
                </div>
              </div>

              <div className="stat-card success">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.positiveReplies}</div>
                  <div className="stat-label">Positive Replies</div>
                </div>
              </div>
            </div>
          </div>

          <div className="campaign-performance">
            <h3>Campaign Performance</h3>
            <div className="campaigns-table">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Sent</th>
                    <th>Opens</th>
                    <th>Clicks</th>
                    <th>Replies</th>
                    <th>Open Rate</th>
                    <th>Reply Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {workflowData.campaigns.map(campaign => {
                    const campaignResponses = responses.filter(r => r.campaignId === campaign.id);
                    const opens = campaignResponses.filter(r => r.type === 'open').length;
                    const clicks = campaignResponses.filter(r => r.type === 'click').length;
                    const replies = campaignResponses.filter(r => r.type === 'reply').length;
                    const openRate = campaign.emailsSent > 0 ? ((opens / campaign.emailsSent) * 100).toFixed(1) : 0;
                    const replyRate = campaign.emailsSent > 0 ? ((replies / campaign.emailsSent) * 100).toFixed(1) : 0;

                    return (
                      <tr key={campaign.id}>
                        <td><strong>{campaign.name}</strong></td>
                        <td>{campaign.emailsSent}</td>
                        <td>{opens}</td>
                        <td>{clicks}</td>
                        <td>{replies}</td>
                        <td>{openRate}%</td>
                        <td>{replyRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="responses-section">
            <div className="responses-header">
              <h3>Recent Activity ({filteredResponses.length})</h3>
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All ({responses.length})
                </button>
                <button 
                  className={`filter-btn ${filter === 'reply' ? 'active' : ''}`}
                  onClick={() => setFilter('reply')}
                >
                  💬 Replies ({responses.filter(r => r.type === 'reply').length})
                </button>
                <button 
                  className={`filter-btn ${filter === 'open' ? 'active' : ''}`}
                  onClick={() => setFilter('open')}
                >
                  👁️ Opens ({responses.filter(r => r.type === 'open').length})
                </button>
                <button 
                  className={`filter-btn ${filter === 'click' ? 'active' : ''}`}
                  onClick={() => setFilter('click')}
                >
                  🖱️ Clicks ({responses.filter(r => r.type === 'click').length})
                </button>
              </div>
            </div>

            <div className="responses-list">
              {filteredResponses.length === 0 ? (
                <div className="empty-responses">
                  <p>No {filter === 'all' ? '' : filter} activity yet. Check back later!</p>
                </div>
              ) : (
                filteredResponses
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map(response => (
                    <div key={response.id} className={`response-card ${response.type}`}>
                      <div className="response-header">
                        <div className="response-icon">{getResponseIcon(response.type)}</div>
                        <div className="response-info">
                          <h4>{response.leadName}</h4>
                          <p className="response-meta">
                            {response.organization} • {response.leadEmail}
                          </p>
                        </div>
                        <div className="response-time">
                          {new Date(response.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="response-body">
                        <p className="response-campaign">
                          <strong>Campaign:</strong> {response.campaignName}
                        </p>
                        {response.content && (
                          <div className="response-content">
                            <strong>Reply:</strong>
                            <p>{response.content}</p>
                            {response.sentiment && (
                              <span 
                                className="sentiment-badge"
                                style={{ backgroundColor: getSentimentColor(response.sentiment) }}
                              >
                                {response.sentiment}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {response.type === 'reply' && (
                        <div className="response-actions">
                          <button className="btn btn-sm btn-primary">📧 Reply</button>
                          <button className="btn btn-sm btn-secondary">📅 Schedule Call</button>
                          <button className="btn btn-sm btn-secondary">✅ Mark as Qualified</button>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>


          <div className="completion-message">
            <h3>🎉 Workflow Complete!</h3>
            <p>You've successfully set up your complete lead generation and outreach workflow:</p>
            <ul>
              <li>✅ Found {workflowData.organizations.length} organizations</li>
              <li>✅ Identified {workflowData.people.length} potential contacts</li>
              <li>✅ Created {workflowData.leads.length} leads in Pipedrive</li>
              <li>✅ Sent {stats.totalEmails} emails across {workflowData.campaigns.length} campaigns</li>
              <li>✅ Received {stats.replies} replies ({stats.positiveReplies} positive)</li>
            </ul>
            <p>Continue monitoring responses and follow up with interested leads!</p>
          </div>
        </>
      )}
    </div>
  );
}

export default ResponseMonitor;