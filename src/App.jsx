import { useState, useEffect } from 'react';
import './App.css';
import OrganizationSearch from './components/OrganizationSearch';
import PeopleFinder from './components/PeopleFinder';
import LeadManagement from './components/LeadManagement';
import EmailCampaign from './components/EmailCampaign';
import ResponseMonitor from './components/ResponseMonitor';
import WorkflowProgress from './components/WorkflowProgress';

function App() {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem('n8n-current-step');
    return saved ? parseInt(saved) : 1;
  });
  
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

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('n8n-workflow-data');
    if (savedData) {
      setWorkflowData(JSON.parse(savedData));
    }
  }, []);

  // Save current step to localStorage
  useEffect(() => {
    localStorage.setItem('n8n-current-step', currentStep.toString());
  }, [currentStep]);

  const steps = [
    { id: 1, name: 'Find Organizations', component: OrganizationSearch },
    { id: 2, name: 'Find People', component: PeopleFinder },
    { id: 3, name: 'Manage Leads', component: LeadManagement },
    { id: 4, name: 'Email Campaign', component: EmailCampaign },
    { id: 5, name: 'Monitor Responses', component: ResponseMonitor }
  ];

  const updateWorkflowData = (key, data) => {
    setWorkflowData(prev => ({
      ...prev,
      [key]: data
    }));
    // Save to localStorage
    localStorage.setItem('n8n-workflow-data', JSON.stringify({
      ...workflowData,
      [key]: data
    }));
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
      <header className="app-header">
        <h1>🚀 n8n Workflow Manager</h1>
        <p className="subtitle">Apollo → Pipedrive → Email Automation</p>
      </header>

      <WorkflowProgress 
        steps={steps} 
        currentStep={currentStep} 
        onStepClick={goToStep}
        workflowData={workflowData}
      />

      <main className="app-main">
        <CurrentComponent
          workflowData={workflowData}
          updateWorkflowData={updateWorkflowData}
          onNext={goToNextStep}
          onPrevious={goToPreviousStep}
        />
      </main>

      <footer className="app-footer">
        
      </footer>
    </div>
  );
}

export default App;