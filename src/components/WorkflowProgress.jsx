import './WorkflowProgress.css';

function WorkflowProgress({ steps, currentStep, onStepClick, workflowData }) {
  const counts = {
    1: workflowData.organizations?.length || 0,
    2: workflowData.people?.length || 0,
    3: workflowData.leads?.length || 0,
    4: workflowData.campaigns?.length || 0
  };

  return (
    <nav className="workflow-nav" aria-label="Workflow steps">
      <div className="workflow-steps">
        {steps.map((step) => {
          const count = counts[step.id];
          const isActive = step.id === currentStep;
          return (
            <button
              key={step.id}
              className={`workflow-step${isActive ? ' active' : ''}`}
              onClick={() => onStepClick(step.id)}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="step-name">{step.name}</span>
              {count > 0 && (
                <span className="step-badge">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default WorkflowProgress;
