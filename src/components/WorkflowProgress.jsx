import './WorkflowProgress.css';

function WorkflowProgress({ steps, currentStep, onStepClick, workflowData }) {
  const counts = {
    1: workflowData.organizations?.length || 0,
    2: workflowData.people?.length || 0,
    3: workflowData.leads?.length || 0,
    4: workflowData.campaigns?.length || 0
  };

  const getStepStatus = (stepId) => {
    if (stepId === currentStep) return 'active';
    if (counts[stepId] > 0) return 'completed';
    return 'pending';
  };

  const getStepCount = (stepId) => counts[stepId];

  return (
    <div className="workflow-progress">
      <div className="progress-steps">
        {steps.map((step) => (
          <div key={step.id} className="progress-step-wrapper">
            <div
              className={`progress-step ${getStepStatus(step.id)} clickable`}
              onClick={() => onStepClick(step.id)}
              title={`Go to ${step.name}`}
            >
              <div className="step-number">
                {step.id}
              </div>
              <div className="step-info">
                <div className="step-name">{step.name}</div>
                <div className="step-count">
                  {getStepCount(step.id) > 0 && `${getStepCount(step.id)} items`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorkflowProgress;