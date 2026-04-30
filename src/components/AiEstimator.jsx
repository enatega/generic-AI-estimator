import { useEffect, useRef, useState } from 'react';
import { generateEstimate } from '../services/estimateApi.js';

const loaderSteps = [
  'Reading your project description',
  'Breaking down features and scope',
  'Estimating effort and complexity',
  'Calculating cost range',
  'Preparing your estimate',
];

const loaderWidths = [15, 35, 55, 75, 90];
const loaderDelays = [0, 1000, 2500, 4000, 5500];

function formatMoney(value) {
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default function AiEstimator() {
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState(30);
  const [workforce, setWorkforce] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [loaderBarWidth, setLoaderBarWidth] = useState(0);
  const [estimate, setEstimate] = useState(null);
  const resultPanelRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  function startLoader() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setLoading(true);
    setEstimate(null);
    setActiveStep(-1);
    setLoaderBarWidth(0);

    loaderSteps.forEach((_, index) => {
      const timer = setTimeout(() => {
        setActiveStep(index);
        setLoaderBarWidth(loaderWidths[index]);
      }, loaderDelays[index]);
      timersRef.current.push(timer);
    });
  }

  function stopLoader(nextEstimate) {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setActiveStep(loaderSteps.length);
    setLoaderBarWidth(100);

    setTimeout(() => {
      setLoading(false);
      setEstimate(nextEstimate);
    }, 400);
  }

  async function handleSubmit() {
    const desc = description.trim();
    const rate = Number(hourlyRate);
    const team = Number(workforce);

    setError('');

    if (desc.length < 20) {
      setError('Please describe your project in a bit more detail.');
      return;
    }

    if (!rate || rate <= 0) {
      setError('Please enter a valid hourly charge.');
      return;
    }

    if (!team || team <= 0) {
      setError('Please enter a valid workforce number.');
      return;
    }

    startLoader();

    try {
      const data = await generateEstimate({ description: desc, hourlyRate: rate, workforce: team });
      stopLoader(data);
    } catch (err) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setLoading(false);
      setError(err.message || 'Something went wrong. Please try again.');
    }

    if (window.innerWidth <= 600 && resultPanelRef.current) {
      resultPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <section className="nx-ai-estimator" id="nx-ai-estimator">
      <div className="nx-ai-left">
        <h2>AI Project Estimator</h2>
        <p className="nx-ai-subtitle">Describe your project and get an instant AI-based cost and time estimate.</p>

        <div className="nx-ai-info-box">
          <h4>How estimation works</h4>
          <p>
            AI analyzes your description, estimates total effort, then calculates completion hours and cost using your hourly charge and workforce.
          </p>
        </div>

        <div className="nx-ai-form">
          <div className="nx-ai-field">
            <label htmlFor="nx_description">Project Description</label>
            <p>Explain what you want to build, change, or estimate.</p>
            <textarea
              id="nx_description"
              rows="6"
              placeholder="Describe your project requirements, features, scope, and goals..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="nx-ai-grid">
            <div className="nx-ai-field">
              <label htmlFor="nx_hourly_rate">Hourly Charge USD</label>
              <input
                type="number"
                id="nx_hourly_rate"
                value={hourlyRate}
                min="1"
                step="1"
                onChange={(event) => setHourlyRate(event.target.value)}
              />
            </div>

            <div className="nx-ai-field">
              <label htmlFor="nx_workforce_input">Workforce</label>
              <input
                type="number"
                id="nx_workforce_input"
                value={workforce}
                min="1"
                step="1"
                onChange={(event) => setWorkforce(event.target.value)}
              />
            </div>
          </div>

          <button type="button" id="nx_generate_estimate" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Generating...' : 'Generate Estimate'}
          </button>

          {error ? <div className="nx-ai-error" id="nx_error">{error}</div> : null}
        </div>
      </div>

      <div className="nx-ai-right" id="nx_result_panel" ref={resultPanelRef}>
        <div className="nx-ai-right-inner">
          <h3>What you'll get</h3>
          <p>AI-generated estimation based on your inputs.</p>

          <div className={`nx-ai-loader ${loading ? 'active' : ''}`} id="nx_loader">
            <div className="nx-ai-loader-header">
              <div className="nx-ai-loader-icon">✦</div>
              <span>
                Analysing your project request
                <span className="nx-ai-dots"><span /><span /><span /></span>
              </span>
            </div>

            <div className="nx-ai-loader-bar-track">
              <div className="nx-ai-loader-bar-fill" id="nx_loader_bar" style={{ width: `${loaderBarWidth}%` }} />
            </div>

            <div className="nx-ai-loader-steps">
              {loaderSteps.map((step, index) => {
                const done = activeStep === loaderSteps.length || index < activeStep;
                const active = index === activeStep;
                return (
                  <div className={`nx-ai-loader-step ${active ? 'active-step' : ''} ${done ? 'done' : ''}`} key={step}>
                    <b>{done ? '✓' : index + 1}</b><span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`nx-ai-card ${estimate ? 'visible' : ''}`} id="nx_result">
            <h3>AI Estimate</h3>

            <ResultItem label="Project Type" value={estimate?.project_type} />
            <ResultItem label="Complexity" value={estimate?.complexity} />
            <ResultItem label="Total AI Estimated Effort" value={estimate ? `${estimate.min_total_hours} - ${estimate.max_total_hours} hrs` : null} />
            <ResultItem label="Workforce" value={estimate ? `${estimate.workforce} people` : null} />
            <ResultItem label="Estimated Completion Hours" value={estimate ? `${estimate.min_completion_hours} - ${estimate.max_completion_hours} hrs` : null} />
            <ResultItem label="Hourly Charge" value={estimate ? `$${Number(estimate.hourly_rate).toFixed(0)}/hr` : null} />
            <ResultItem label="Estimated Cost" value={estimate ? `${formatMoney(estimate.min_cost)} - ${formatMoney(estimate.max_cost)}` : null} cost />

            <div className="nx-ai-summary">
              <h4>Summary</h4>
              <p id="nx_summary">{estimate?.summary || '—'}</p>
            </div>

            <div className="nx-ai-assumptions">
              <h4>Assumptions</h4>
              <ul id="nx_assumptions">
                {(estimate?.assumptions?.length ? estimate.assumptions : ['—']).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultItem({ label, value, cost = false }) {
  return (
    <div className={`nx-ai-item ${cost ? 'nx-ai-cost-row' : ''}`}>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}
