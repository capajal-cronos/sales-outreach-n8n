import './WorkflowProgress.css';

function WorkflowProgress({ steps, currentStep, onStepClick, workflowData }) {
  const getStepStatus = (stepId) => {
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'pending';
  };

  const getStepCount = (stepId) => {
    const counts = {
      1: workflowData.organizations?.length || 0,
      2: workflowData.people?.length || 0,
      3: workflowData.leads?.length || 0,
      4: workflowData.campaigns?.length || 0,
      5: workflowData.responses?.length || 0
    };
    return counts[stepId];
  };

  return (
    <div className="workflow-progress">
      <div className="progress-steps">
        {steps.map((step, index) => (
          <div key={step.id} className="progress-step-wrapper">
            <div
              className={`progress-step ${getStepStatus(step.id)}`}
              onClick={() => onStepClick(step.id)}
            >
              <div className="step-number">
                {getStepStatus(step.id) === 'completed' ? '✓' : step.id}
              </div>
              <div className="step-info">
                <div className="step-name">{step.name}</div>
                <div className="step-count">
                  {getStepCount(step.id) > 0 && `${getStepCount(step.id)} items`}
                </div>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`progress-connector ${getStepStatus(step.id) === 'completed' ? 'completed' : ''}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorkflowProgress;