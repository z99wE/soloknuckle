import { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [sandboxCode, setSandboxCode] = useState('npm run build && npm run test');
  const [sandboxResult, setSandboxResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [aiCommitsEnabled, setAiCommitsEnabled] = useState(false);

  const [llmConfig, setLlmConfig] = useState({
    provider: 'openai',
    model: 'gpt-4',
    apiKey: '',
    apiBase: ''
  });
  const [llmStatus, setLlmStatus] = useState('');

  const [telemetry, setTelemetry] = useState({ aiCommits: 0, humanCommits: 0, linesByAi: 0, linesByHuman: 0 });
  const [branches, setBranches] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [personaTargetDir, setPersonaTargetDir] = useState('./ui/src');
  const [personaProfile, setPersonaProfile] = useState('Frontend UX Designer');
  const [personaStatus, setPersonaStatus] = useState('');
  const [safeModeStatus, setSafeModeStatus] = useState('');
  const [interceptions, setInterceptions] = useState([]);

  useEffect(() => {
    fetch('/api/config/llm')
      .then(res => res.json())
      .then(data => {
        setLlmConfig(data);
      })
      .catch(() => console.log('Could not fetch LLM config'));

    fetch('/api/telemetry')
      .then(res => res.json())
      .then(data => setTelemetry(data))
      .catch(() => console.log('Could not fetch telemetry'));

    fetch('/api/branches')
      .then(res => res.json())
      .then(data => setBranches(data))
      .catch(() => console.log('Could not fetch branches'));

    fetch('/api/score')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(() => setMetrics({ overall: 0, quality: { score: 0 }, testing: { score: 0 }, security: { score: 0 }, efficiency: { score: 0 }, accessibility: { score: 0 }, error: 'Backend unavailable' }));

    fetch('/api/safe-mode')
      .then(res => res.json())
      .then(data => {
        if (data.hooksEnabled !== undefined) setHooksEnabled(data.hooksEnabled);
        if (data.aiCommitsEnabled !== undefined) setAiCommitsEnabled(data.aiCommitsEnabled);
      })
      .catch(() => console.log('Could not fetch safe mode config'));

    const pollInterceptions = setInterval(() => {
      fetch('/api/sandbox/interceptions')
        .then(res => res.json())
        .then(data => setInterceptions(data))
        .catch(() => {});
    }, 2000);

    return () => clearInterval(pollInterceptions);
  }, []);

  const handleSandboxExecute = async () => {
    setIsExecuting(true);
    setSandboxResult('Executing...');
    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: sandboxCode })
      });
      const data = await res.json();
      setSandboxResult(data.output);
    } catch (e) {
      setSandboxResult(`Error connecting to sandbox backend: ${e.message}`);
    }
    setIsExecuting(false);
  };

  const handleGenerateSuggestions = async () => {
    setIsAnalyzing(true);
    setAiSuggestions(null);
    try {
      const res = await fetch('/api/llm/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics })
      });
      const data = await res.json();
      setAiSuggestions(data.suggestions);
    } catch (e) {
      setAiSuggestions(['Failed to generate AI suggestions. Check your LLM API Key config.']);
    }
    setIsAnalyzing(false);
  };

  return (
    <div>
      <header style={{ marginBottom: '3rem' }}>
        <h1>Soloknuckle Control Hub</h1>
        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          Enforce production hygiene with Neo-Brutalist authority. 
          Manage feature flags, LLM audits, and staging environments locally.
        </p>
      </header>

      <main className="grid">
        {/* Card 1: Production Safe Mode */}
        <section className="card" aria-label="Production Safe Mode">
          <h2>Production Safe Mode</h2>
          <p>Locks the `main` branch. All commits must go through `soloknuckle check`.</p>
          <div style={{ flex: 1, marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>
              <strong>Pre-push Hooks</strong>
              <div 
                className={`toggle-track ${hooksEnabled ? 'active' : ''}`} 
                onClick={() => setHooksEnabled(!hooksEnabled)}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHooksEnabled(!hooksEnabled); } }}
                role="switch"
                aria-checked={hooksEnabled}
                tabIndex={0}
                aria-label="Toggle Pre-push hooks"
              >
                <div className="toggle-thumb" style={{ transform: hooksEnabled ? 'translateX(24px)' : 'translateX(0)' }}></div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>AI Direct Commits</strong>
              <div 
                className={`toggle-track ${aiCommitsEnabled ? 'active' : ''}`} 
                onClick={() => setAiCommitsEnabled(!aiCommitsEnabled)}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAiCommitsEnabled(!aiCommitsEnabled); } }}
                role="switch"
                aria-checked={aiCommitsEnabled}
                tabIndex={0}
                aria-label="Toggle AI Direct Commits"
              >
                <div className="toggle-thumb" style={{ transform: aiCommitsEnabled ? 'translateX(24px)' : 'translateX(0)' }}></div>
              </div>
            </div>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={async () => {
            setSafeModeStatus('Saving...');
            try {
              await fetch('/api/safe-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hooksEnabled, aiCommitsEnabled })
              });
              setSafeModeStatus('Config Saved');
            } catch (e) {
              setSafeModeStatus('Error saving');
            }
            setTimeout(() => setSafeModeStatus(''), 3000);
          }}>Save Config</button>
          {safeModeStatus && <p style={{ fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.5rem' }}>{safeModeStatus}</p>}
        </section>

        {/* Card 2: LLM Auditor Config & Suggestions */}
        <div className="card" style={{ backgroundColor: 'var(--tertiary)' }}>
          <h2>LLM Auditor Config</h2>
          <p>Configure the AI agent that strictly enforces <strong>AGENTS.md</strong> rules on pre-commit hooks.</p>
          <div style={{ marginBottom: '1.5rem', flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>API Provider</label>
            <select 
              style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }}
              value={llmConfig.provider}
              onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
            >
              <option value="Ollama (Local)">Ollama (Local - Privacy First)</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Anthropic">Anthropic</option>
              <option value="Gemini">Gemini</option>
            </select>
            
            {llmConfig.provider !== 'Ollama (Local)' ? (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>API Key</label>
                <input 
                  type="password" 
                  placeholder={llmConfig.apiKey ? "********" : "Enter API Key"}
                  value={llmConfig.apiKey.includes('...') ? '' : llmConfig.apiKey}
                  onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)' }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>Base URL</label>
                <input 
                  type="text" 
                  value={llmConfig.baseUrl}
                  onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)' }}
                />
              </div>
            )}
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>Model (Optional Override)</label>
              <input 
                type="text" 
                placeholder="e.g. gpt-4o, claude-3-5-sonnet-20240620"
                value={llmConfig.model}
                onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)' }}
              />
            </div>
            {llmStatus && <p style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{llmStatus}</p>}
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%' }}
            onClick={async () => {
              setLlmStatus('Saving...');
              try {
                const res = await fetch('/api/config/llm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(llmConfig)
                });
                if (res.ok) setLlmStatus('Saved Successfully!');
                else setLlmStatus('Failed to save.');
              } catch (e) {
                setLlmStatus('Error saving config.');
              }
              setTimeout(() => setLlmStatus(''), 3000);
            }}
          >
            Connect Provider
          </button>
        </div>

        {/* Card 3: Visual Branch Visualizer */}
        <div className="card">
          <h2>Visual Branch Map</h2>
          <p>Real-time topology of active feature branches and their staging URLs.</p>
          <div style={{ padding: '1rem', background: '#f4f4f0', border: 'var(--border-width) solid var(--border-color)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1rem' }}>
            {branches.length > 0 ? branches.map((branch, idx) => (
              <div key={branch.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div className="visualizer-node" style={{ borderColor: branch.active ? '#000' : 'var(--secondary)' }} aria-label={`Branch: ${branch.name}${branch.active ? ' (active)' : ''}`}>
                  {branch.active && <span className="badge" style={{ position: 'absolute', top: '-10px', right: '-10px' }}>Active</span>}
                  <strong>{branch.name}</strong>
                  <div style={{ fontSize: '0.8rem' }}>soloknuckle-{branch.name.replace('/', '-')}.vercel.app</div>
                </div>
                {idx < branches.length - 1 && <div className="visualizer-line"></div>}
              </div>
            )) : (
              <p>No branches detected</p>
            )}
          </div>
        </div>

        {/* Card 4: Agent Sandbox Mode */}
        <section className="card" style={{ backgroundColor: 'var(--tertiary)' }} aria-label="Agent Sandbox Mode">
          <h2>Agent Sandbox Mode</h2>
          <p>Run agent-generated code in a command sandbox to test before proposing a commit.</p>
          <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="sandbox-code" className="sr-only">Sandbox Code</label>
            <textarea 
              id="sandbox-code"
              className="text-area" 
              placeholder="Paste generated script or agent logic here to run in a secure, isolated sandbox..."
              value={sandboxCode}
              onChange={(e) => setSandboxCode(e.target.value)}
              aria-label="Code to run in sandbox"
            ></textarea>
            {sandboxResult && (
              <pre style={{ background: '#fff', color: '#000', padding: '1rem', overflowX: 'auto', border: 'var(--border-width) solid var(--border-color)', fontSize: '0.8rem', marginTop: '1rem', boxShadow: '4px 4px 0 #000' }}>
                {sandboxResult}
              </pre>
            )}
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1rem', backgroundColor: '#000', color: 'var(--tertiary)' }} onClick={handleSandboxExecute} disabled={isExecuting}>
            {isExecuting ? 'Executing...' : 'Execute in Sandbox'}
          </button>
        </section>

        {/* Card 4.5: Agent Interceptions Log */}
        <section className="card" style={{ backgroundColor: '#fff' }} aria-label="Agent Firewall Logs">
          <h2>Agent Firewall Logs</h2>
          <p>Real-time feed of intercepted and blocked destructive actions attempted by agents.</p>
          <div style={{ flex: 1, marginTop: '1rem', maxHeight: '200px', overflowY: 'auto', border: 'var(--border-width) solid var(--border-color)', background: '#0a0a0f', color: '#f0f0ff', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' }}>
            {interceptions.length === 0 ? (
              <p style={{ margin: 0, fontStyle: 'italic', color: '#8888aa' }}>No intercepted commands yet.</p>
            ) : (
              interceptions.map((log, idx) => (
                <div key={idx} style={{ borderBottom: '1px solid #2a2a38', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#8888aa' }}>{new Date(log.time).toLocaleTimeString()}</div>
                  <div style={{ fontFamily: 'monospace', color: '#6366f1', marginTop: '0.25rem' }}>&gt; {log.command}</div>
                  <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.25rem' }}>Blocked: {log.reason}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Card: Project Health Metrics */}
        <section className="card" style={{ backgroundColor: 'var(--secondary)' }}>
          <h2>Project Health Metrics</h2>
          <p>Real-time structural Vibe Check of your codebase.</p>
          
          {metrics ? (
            <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', background: '#fff', boxShadow: '3px 3px 0 #000' }}>
                <strong style={{ fontSize: '1.2rem' }}>Overall Score: {metrics.overall}/100</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ background: '#fff', border: '2px solid #000', padding: '0.5rem', fontWeight: 'bold' }}>Quality: {metrics.quality?.score}</div>
                <div style={{ background: '#fff', border: '2px solid #000', padding: '0.5rem', fontWeight: 'bold' }}>Testing: {metrics.testing?.score}</div>
                <div style={{ background: '#fff', border: '2px solid #000', padding: '0.5rem', fontWeight: 'bold' }}>Security: {metrics.security?.score}</div>
                <div style={{ background: '#fff', border: '2px solid #000', padding: '0.5rem', fontWeight: 'bold' }}>Efficiency: {metrics.efficiency?.score}</div>
                <div style={{ background: '#fff', border: '2px solid #000', padding: '0.5rem', fontWeight: 'bold', gridColumn: '1 / -1' }}>Accessibility: {metrics.accessibility?.score}</div>
              </div>

              {!aiSuggestions && (
                <button 
                  className="btn" 
                  style={{ width: '100%', marginTop: '1rem', backgroundColor: '#000', color: 'var(--secondary)' }} 
                  onClick={handleGenerateSuggestions} 
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? 'Analyzing with LLM...' : 'Generate AI Suggestions'}
                </button>
              )}

              {aiSuggestions && (
                <div style={{ background: 'var(--primary)', color: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1rem', marginTop: '1rem', boxShadow: '4px 4px 0 #000' }}>
                  <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '0.5rem' }}>AI Action Plan</strong>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
                    {aiSuggestions.map((suggestion, idx) => (
                      <li key={idx} style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: '1rem', fontWeight: 'bold' }}>Loading metrics...</div>
          )}
        </section>

        {/* Card 5: Hygiene Suggestions */}
        <div className="card">
          <h2>Hygiene Audit Suggestions</h2>
          <p>Automated static analysis suggestions based on AGENTS.md. Apply manually to ensure safety.</p>
          <div style={{ background: 'var(--primary)', color: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1.5rem', marginTop: '1rem', flex: 1, boxShadow: '4px 4px 0 #000' }}>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '0.5rem' }}>[Violation Detected]</strong>
            <p style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', fontWeight: 'bold' }}>Direct modification of `main` branch detected in local git state.</p>
            <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Suggested Fix:</strong>
            <code style={{ display: 'block', background: '#000', color: 'var(--secondary)', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', fontSize: '0.9rem', fontWeight: 'bold' }}>
              git checkout -b feature/your-feature-name
            </code>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem', backgroundColor: '#fff', color: '#000' }} onClick={() => alert('Violation acknowledged. Please apply the suggested fix before committing.')}>Acknowledge</button>
        </div>

        {/* Card 6: Telemetry Dashboard */}
        <div className="card" style={{ backgroundColor: '#fff' }}>
          <h2>Agent Telemetry</h2>
          <p>Track AI vs Human code contributions.</p>
          <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', background: 'var(--secondary)', boxShadow: '3px 3px 0 #000' }}>
              <strong>AI Commits:</strong> {telemetry?.aiCommits || 0}
            </div>
            <div style={{ padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', background: '#fff', boxShadow: '3px 3px 0 #000' }}>
              <strong>Human Commits:</strong> {telemetry?.humanCommits || 0}
            </div>
            <div style={{ padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', background: 'var(--primary)', color: '#fff', marginTop: '1rem', boxShadow: '3px 3px 0 #000' }}>
              <strong>Lines by AI:</strong> {telemetry?.linesByAi || 0}
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => alert('Full report: run `soloknuckle audit` in your terminal for detailed breakdown.')}>View Full Report</button>
        </div>

        {/* Card 7: Persona Manager */}
        <section className="card" aria-label="Agent Persona Manager">
          <h2>Agent Persona Manager</h2>
          <p>Assign directory-specific rules (`.cursorrules` / `SKILL.md`) for specialized AI behavior.</p>
          <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="target-dir" style={{ display: 'block', fontWeight: '900', marginBottom: '0.5rem' }}>Target Directory</label>
            <input id="target-dir" type="text" value={personaTargetDir} onChange={e => setPersonaTargetDir(e.target.value)} aria-label="Target directory path" style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '1.5rem', fontWeight: 'bold' }} />
            
            <label htmlFor="persona-profile" style={{ display: 'block', fontWeight: '900', marginBottom: '0.5rem' }}>Persona Profile</label>
            <select id="persona-profile" value={personaProfile} onChange={e => setPersonaProfile(e.target.value)} aria-label="Select a persona profile" style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', fontWeight: 'bold', background: '#fff' }}>
              <option>Frontend UX Designer</option>
              <option>Backend Security Architect</option>
              <option>Data Engineer</option>
            </select>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={async () => {
            setPersonaStatus('Applying...');
            try {
              const res = await fetch('/api/personas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetDir: personaTargetDir, personaProfile })
              });
              if (res.ok) setPersonaStatus('Persona Applied!');
              else setPersonaStatus('Failed to apply.');
            } catch (e) {
              setPersonaStatus('Error.');
            }
            setTimeout(() => setPersonaStatus(''), 3000);
          }}>Apply Persona</button>
          {personaStatus && <p style={{ fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.5rem' }}>{personaStatus}</p>}
        </section>
      </main>
    </div>
  );
}

export default App;
