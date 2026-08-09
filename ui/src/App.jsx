import { useState } from 'react';
import './index.css';

function App() {
  const [flags, setFlags] = useState({
    'export-csv': true,
    'new-onboarding': false,
    'ai-auditor': true,
  });

  const [sandboxCode, setSandboxCode] = useState('npm run build && npm run test');
  const [sandboxResult, setSandboxResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  const toggleFlag = (key) => {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSandboxExecute = async () => {
    setIsExecuting(true);
    setSandboxResult('Executing...');
    try {
      const res = await fetch('http://localhost:3001/api/sandbox', {
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

  return (
    <div>
      <header style={{ marginBottom: '3rem' }}>
        <h1>Soloknuckle Control Hub</h1>
        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          Enforce production hygiene with Neo-Brutalist authority. 
          Manage feature flags, LLM audits, and staging environments locally.
        </p>
      </header>

      <div className="grid">
        {/* Card 1: Feature Flags */}
        <div className="card">
          <h2>Feature Flags</h2>
          <p>Instantly toggle features in production environments. Changes reflect immediately via remote config.</p>
          <div style={{ flex: 1, marginTop: '1rem' }}>
            {Object.entries(flags).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>{key}</strong>
                <div className="toggle-switch" onClick={() => toggleFlag(key)}>
                  <div className={`toggle-track ${value ? 'active' : ''}`}>
                    <div className="toggle-thumb"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1rem' }}>Save State</button>
        </div>

        {/* Card 2: LLM Auditor Config & Suggestions */}
        <div className="card" style={{ backgroundColor: 'var(--tertiary)' }}>
          <h2>LLM Auditor Config</h2>
          <p>Configure the AI agent that strictly enforces <strong>AGENTS.md</strong> rules on pre-commit hooks.</p>
          <div style={{ marginBottom: '1.5rem', flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>API Provider</label>
            <select style={{ width: '100%', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', fontWeight: 'bold', fontSize: '1rem' }}>
              <option>Ollama (Local - Privacy First)</option>
              <option>OpenAI (GPT-4o)</option>
              <option>Anthropic (Claude 3.5 Sonnet)</option>
              <option>Gemini (1.5 Pro)</option>
            </select>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }}>Connect Provider</button>
        </div>

        {/* Card 3: Visual Branch Visualizer */}
        <div className="card">
          <h2>Visual Branch Map</h2>
          <p>Real-time topology of active feature branches and their staging URLs.</p>
          <div style={{ padding: '1rem', background: '#f4f4f0', border: 'var(--border-width) solid var(--border-color)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1rem' }}>
            <div className="visualizer-node" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
              <strong>main (Production)</strong>
              <div style={{ fontSize: '0.8rem' }}>soloknuckle.vercel.app</div>
            </div>
            <div className="visualizer-line"></div>
            <div className="visualizer-node" style={{ borderColor: 'var(--secondary)' }}>
              <strong>develop (Staging)</strong>
              <div style={{ fontSize: '0.8rem' }}>soloknuckle-staging.vercel.app</div>
            </div>
            <div className="visualizer-line"></div>
            <div className="visualizer-node" style={{ borderColor: '#000' }}>
              <span className="badge" style={{ position: 'absolute', top: '-10px', right: '-10px' }}>Active</span>
              <strong>feature/neo-ui</strong>
              <div style={{ fontSize: '0.8rem' }}>soloknuckle-git-feature-neo-ui.vercel.app</div>
            </div>
          </div>
        </div>

        {/* Card 4: Agent Sandbox Mode */}
        <div className="card" style={{ backgroundColor: '#000', color: '#fff', borderColor: '#000' }}>
          <h2 style={{ color: 'var(--secondary)' }}>Agent Sandbox Mode</h2>
          <p style={{ color: '#ccc' }}>Provide a temporary containerized shell for AI agents to safely test generated code before proposing a commit.</p>
          <div style={{ flex: 1, marginTop: '1rem' }}>
            <textarea 
              className="text-area" 
              style={{ backgroundColor: '#111', color: '#00ffcc', borderColor: '#333' }}
              placeholder="Paste generated script or agent logic here to run in a secure, isolated sandbox..."
              value={sandboxCode}
              onChange={(e) => setSandboxCode(e.target.value)}
            ></textarea>
            {sandboxResult && (
              <pre style={{ background: '#222', color: '#fff', padding: '1rem', overflowX: 'auto', border: '1px solid #444', fontSize: '0.8rem', marginTop: '1rem' }}>
                {sandboxResult}
              </pre>
            )}
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={handleSandboxExecute} disabled={isExecuting}>
            {isExecuting ? 'Executing...' : 'Execute in Sandbox'}
          </button>
        </div>

        {/* Card 5: Hygiene Suggestions */}
        <div className="card">
          <h2>Hygiene Audit Suggestions</h2>
          <p>Automated static analysis suggestions based on AGENTS.md. Apply manually to ensure safety.</p>
          <div style={{ background: '#ffeeee', border: 'var(--border-width) solid var(--primary)', padding: '1rem', marginTop: '1rem', flex: 1 }}>
            <strong style={{ color: 'var(--primary)' }}>[Violation Detected]</strong>
            <p style={{ fontSize: '0.9rem', margin: '0.5rem 0' }}>Direct modification of `main` branch detected in local git state.</p>
            <strong style={{ display: 'block', marginTop: '1rem', fontSize: '0.9rem' }}>Suggested Fix:</strong>
            <code style={{ display: 'block', background: '#fff', padding: '0.5rem', border: '1px solid #000', marginTop: '0.5rem', fontSize: '0.8rem' }}>
              git checkout -b feature/your-feature-name
            </code>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }}>Acknowledge</button>
        </div>
      </div>
    </div>
  );
}

export default App;
