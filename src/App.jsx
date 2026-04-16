import { useState, useEffect, useRef } from 'react';
import './App.css';
import OrganizationSearch from './components/OrganizationSearch';
import PeopleFinder from './components/PeopleFinder';
import LeadManagement from './components/LeadManagement';
import ResponseMonitor from './components/ResponseMonitor';
import WorkflowProgress from './components/WorkflowProgress';

const CAMPAIGN_TIMEOUT_MS = 10 * 60 * 1000;
const GRACE_MS = 45000; // 45s — enough time for n8n to generate and queue the email

function App() {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem('n8n-current-step');
    return saved ? parseInt(saved) : 1;
  });

  // { [leadId]: timestamp } — persists across tab switches and page refreshes
  const [campaignPendingLeads, setCampaignPendingLeads] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('n8n-campaign-pending') || '{}');
    } catch { return {}; }
  });
  const campaignPendingRef = useRef(campaignPendingLeads);

  const [workflowData, setWorkflowData] = useState(() => {
    const saved = localStorage.getItem('n8n-workflow-data');
    return saved ? JSON.parse(saved) : {
      organizations: [],
      people: [],
      leads: [],
      campaigns: [],
      responses: []
    };
  });

  // Sync workflow data and current step to localStorage
  useEffect(() => {
    localStorage.setItem('n8n-workflow-data', JSON.stringify(workflowData));
  }, [workflowData]);

  useEffect(() => {
    localStorage.setItem('n8n-current-step', currentStep.toString());
  }, [currentStep]);

  useEffect(() => {
    localStorage.setItem('n8n-campaign-pending', JSON.stringify(campaignPendingLeads));
    campaignPendingRef.current = campaignPendingLeads;
  }, [campaignPendingLeads]);

  // Poll queue while there are pending leads.
  // Emails are DELETED on approve/decline, so check "no pending email + grace period passed" instead of status.
  useEffect(() => {
    if (Object.keys(campaignPendingLeads).length === 0) return;
    const interval = setInterval(async () => {
      const pending = campaignPendingRef.current;
      if (Object.keys(pending).length === 0) return;
      try {
        const res = await fetch('http://localhost:3001/api/email-queue/pending');
        if (!res.ok) return;
        const data = await res.json();
        const pendingEmails = data.emails || [];
        const now = Date.now();
        const next = { ...pending };
        let changed = false;
        Object.entries(next).forEach(([leadId, ts]) => {
          const hasPendingEmail = pendingEmails.some(e => e.lead_id === leadId);
          const gracePassed = now - ts > GRACE_MS;
          const timedOut = now - ts > CAMPAIGN_TIMEOUT_MS;
          // Unblock if: grace period passed and no pending email (was decided), or hard timeout
          if ((!hasPendingEmail && gracePassed) || timedOut) { delete next[leadId]; changed = true; }
        });
        if (changed) setCampaignPendingLeads(next);
      } catch (_) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [Object.keys(campaignPendingLeads).length]);

  const addCampaignPendingLeads = (leadIds) => {
    const ts = Date.now();
    setCampaignPendingLeads(prev => {
      const next = { ...prev };
      leadIds.forEach(id => { next[id] = ts; });
      return next;
    });
  };

  const removeCampaignPendingLeads = (leadIds) => {
    setCampaignPendingLeads(prev => {
      const next = { ...prev };
      leadIds.forEach(id => delete next[id]);
      return next;
    });
  };

  const [workflowErrors, setWorkflowErrors] = useState([]);
  const [responseCount, setResponseCount] = useState(0);

  // Poll for workflow errors every 3 seconds and response count every 10 seconds
  useEffect(() => {
    const fetchErrors = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/workflow-errors');
        if (!res.ok) return;
        const data = await res.json();
        setWorkflowErrors(data.errors || []);
      } catch (_) {}
    };
    const fetchResponseCount = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/responses');
        if (!res.ok) return;
        const data = await res.json();
        setResponseCount(data.count || 0);
      } catch (_) {}
    };
    fetchErrors();
    fetchResponseCount();
    const errorInterval = setInterval(fetchErrors, 3000);
    const responseInterval = setInterval(fetchResponseCount, 10000);
    return () => { clearInterval(errorInterval); clearInterval(responseInterval); };
  }, []);

  // When an error arrives for a specific lead, unblock it immediately
  useEffect(() => {
    const errorLeadIds = workflowErrors
      .filter(e => e.lead_id)
      .map(e => e.lead_id);
    if (errorLeadIds.length === 0) return;
    setCampaignPendingLeads(prev => {
      const hasAny = errorLeadIds.some(id => id in prev);
      if (!hasAny) return prev;
      const next = { ...prev };
      errorLeadIds.forEach(id => delete next[id]);
      return next;
    });
  }, [workflowErrors]);

  const dismissError = async (id) => {
    try {
      await fetch(`http://localhost:3001/api/workflow-errors/${id}`, { method: 'DELETE' });
      setWorkflowErrors(prev => prev.filter(e => e.id !== id));
    } catch (_) {}
  };

  const steps = [
    { id: 1, name: 'Find Organizations', component: OrganizationSearch },
    { id: 2, name: 'Find People', component: PeopleFinder },
    { id: 3, name: 'Leads & Campaign', component: LeadManagement },
    { id: 4, name: 'Monitor Responses', component: ResponseMonitor }
  ];

  const updateWorkflowData = (key, data) => {
    setWorkflowData(prev => ({ ...prev, [key]: data }));
  };

  const goToNextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepId) => {
    setCurrentStep(stepId);
  };

  const CurrentComponent = steps[currentStep - 1].component;

  return (
    <div className="app">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <h1>LeadFlow Pro</h1>
          <p className="sidebar-tagline">Sales Outreach Platform</p>
        </div>
        <div className="sidebar-divider" />
        <WorkflowProgress
          steps={steps}
          currentStep={currentStep}
          onStepClick={goToStep}
          workflowData={workflowData}
          responseCount={responseCount}
        />
      </aside>

      <main className="app-main">
        <CurrentComponent
          workflowData={workflowData}
          updateWorkflowData={updateWorkflowData}
          onNext={goToNextStep}
          onPrevious={goToPreviousStep}
          campaignPendingLeads={campaignPendingLeads}
          onCampaignStarted={addCampaignPendingLeads}
          onCampaignDecided={removeCampaignPendingLeads}
          workflowErrors={workflowErrors}
          onDismissError={dismissError}
        />
      </main>
    </div>
  );
}

export default App;
