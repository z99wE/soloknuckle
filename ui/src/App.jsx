import { useState, useEffect, useCallback } from 'react';
import './index.css';

const LOGO = `
 ███████╗██╗      ██████╗ ███████╗██╗   ██╗███╗   ██╗██╗  ██╗
 ██╔════╝██║     ██╔═══██╗██╔════╝██║   ██║████╗  ██║██║ ██╔╝
 ███████╗██║     ██║   ██║███████╗██║   ██║██╔██╗ ██║█████╔╝ 
 ╚════██║██║     ██║   ██║╚════██║██║   ██║██║╚██╗██║██╔═██╗ 
 ███████║███████╗╚██████╔╝███████║╚██████╔╝██║ ╚████║██║  ██╗
 ╚══════╝╚══════╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝
`;

const PROVIDER_TYPES = [
  'OpenAI', 'Anthropic', 'Gemini', 'DeepSeek', 'Mistral',
  'Groq', 'xAI (Grok)', 'OpenRouter', 'Cohere', 'OpenAI Compatible', 'Ollama (Local)'
];

const PROVIDER_DEFAULTS = {
  'OpenAI':              { model: 'gpt-4o',                  baseUrl: '' },
  'Anthropic':           { model: 'claude-3-5-sonnet-20240620', baseUrl: '' },
  'Gemini':              { model: 'gemini-1.5-pro',          baseUrl: '' },
  'DeepSeek':            { model: 'deepseek-chat',           baseUrl: '' },
  'Mistral':             { model: 'mistral-large-latest',    baseUrl: '' },
  'Groq':                { model: 'llama-3.3-70b-versatile', baseUrl: '' },
  'xAI (Grok)':          { model: 'grok-2-1212',             baseUrl: '' },
  'OpenRouter':          { model: 'auto',                    baseUrl: '' },
  'Cohere':              { model: 'command-r-plus',          baseUrl: '' },
  'OpenAI Compatible':   { model: 'default',                 baseUrl: 'http://localhost:1234/v1/chat/completions' },
  'Ollama (Local)':      { model: 'llama3',                  baseUrl: 'http://localhost:11434/api/chat' },
};

function App() {
  const [sandboxCode, setSandboxCode] = useState('npm run build && npm run test');
  const [sandboxResult, setSandboxResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [aiCommitsEnabled, setAiCommitsEnabled] = useState(false);

  // ── Multi-Provider State ──────────────────────────────────────────────────
  const [providers, setProviders] = useState([]);
  const [activeProviderId, setActiveProviderId] = useState(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderType, setNewProviderType] = useState('OpenAI');
  const [newProviderKey, setNewProviderKey] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
  const [newProviderModel, setNewProviderModel] = useState('');
  const [providerStatus, setProviderStatus] = useState('');
  const [testingProviderId, setTestingProviderId] = useState(null);

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

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/config/providers');
      const data = await res.json();
      setProviders(data.providers || []);
      setActiveProviderId(data.activeId || null);
    } catch { /* backend unavailable */ }
  }, []);

  useEffect(() => {
    loadProviders();
    fetch('/api/config/llm').then(r => r.json()).catch(() => null);
    fetch('/api/telemetry').then(r => r.json()).then(d => setTelemetry(d)).catch(() => null);
    fetch('/api/branches').then(r => r.json()).then(d => setBranches(d)).catch(() => null);
    fetch('/api/score').then(r => r.json()).then(d => setMetrics(d)).catch(() => setMetrics({ overall: 0, quality: { score: 0 }, testing: { score: 0 }, security: { score: 0 }, efficiency: { score: 0 }, accessibility: { score: 0 }, error: 'Backend unavailable' }));
    fetch('/api/safe-mode').then(r => r.json()).then(d => { if (d.hooksEnabled !== undefined) setHooksEnabled(d.hooksEnabled); if (d.aiCommitsEnabled !== undefined) setAiCommitsEnabled(d.aiCommitsEnabled); }).catch(() => null);
    const poll = setInterval(() => { fetch('/api/sandbox/interceptions').then(r => r.json()).then(d => setInterceptions(d)).catch(() => null); }, 2000);
    return () => clearInterval(poll);
  }, [loadProviders]);

  const showProviderUrl = newProviderType === 'Ollama (Local)' || newProviderType === 'OpenAI Compatible';

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    setProviderStatus('Adding...');
    try {
      const res = await fetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProviderName.trim(), type: newProviderType, apiKey: newProviderKey, baseUrl: newProviderBaseUrl, model: newProviderModel }),
      });
      if (res.ok) {
        setProviderStatus('Provider added!');
        setShowAddProvider(false);
        setNewProviderName(''); setNewProviderKey(''); setNewProviderBaseUrl(''); setNewProviderModel('');
        await loadProviders();
      } else {
        const err = await res.json();
        setProviderStatus(`Failed: ${err.error || 'Unknown error'}`);
      }
    } catch { setProviderStatus('Error connecting to backend.'); }
    setTimeout(() => setProviderStatus(''), 4000);
  };

  const handleDeleteProvider = async (id) => {
    try { await fetch(`/api/config/providers/${id}`, { method: 'DELETE' }); await loadProviders(); } catch { /* ignore */ }
  };

  const handleActivateProvider = async (id) => {
    setProviderStatus('Activating...');
    try {
      await fetch('/api/config/providers/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: id }) });
      setProviderStatus('Provider activated!');
      await loadProviders();
    } catch { setProviderStatus('Error activating provider.'); }
    setTimeout(() => setProviderStatus(''), 3000);
  };

  const handleTestProvider = async (id) => {
    setTestingProviderId(id);
    try {
      const res = await fetch('/api/config/providers/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: id }) });
      const data = await res.json();
      if (data.success) setProviderStatus(`Connection OK — "${data.reply}"`);
      else setProviderStatus(`Failed: ${data.error}`);
    } catch { setProviderStatus('Error testing provider.'); }
    setTestingProviderId(null);
    setTimeout(() => setProviderStatus(''), 6000);
  };

  const handleSandboxExecute = async () => {
    setIsExecuting(true); setSandboxResult('Executing...');
    try { const res = await fetch('/api/sandbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: sandboxCode }) }); const data = await res.json(); setSandboxResult(data.output); } catch (e) { setSandboxResult(`Error: ${e.message}`); }
    setIsExecuting(false);
  };

  const handleGenerateSuggestions = async () => {
    setIsAnalyzing(true); setAiSuggestions(null);
    try { const res = await fetch('/api/llm/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metrics }) }); const data = await res.json(); setAiSuggestions(data.suggestions); } catch { setAiSuggestions(['Failed to generate AI suggestions. Check your LLM config.']); }
    setIsAnalyzing(false);
  };

  const activeProviderName = providers.find(p => p.id === activeProviderId)?.name || 'None';

  return (
    <div>
      <a href="#main-content" className="sr-only" style={{ position: 'absolute', top: 0, left: 0, background: '#000', color: '#fff', padding: '0.5rem 1rem', zIndex: 100 }}>Skip to content</a>
      <header style={{ marginBottom: '3rem' }}>
        <pre style={{
          fontFamily: 'monospace', fontSize: 'clamp(0.28rem, 1vw, 0.58rem)', lineHeight: 1.05,
          fontWeight: 900, color: '#000', background: 'var(--secondary)', padding: '1.5rem',
          border: 'var(--border-width) solid var(--border-color)', boxShadow: '8px 8px 0 #000',
          overflowX: 'auto', textAlign: 'center', marginBottom: '1rem', letterSpacing: '0.05em'
        }} aria-label="Soloknuckle logo">{LOGO}</pre>
        <h1 style={{ textAlign: 'center', fontSize: '2.5rem' }}>Soloknuckle Control Hub</h1>
        <p style={{ fontSize: '1.1rem', fontWeight: 600, textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
          Enforce production hygiene with Neo-Brutalist authority.
          Manage LLM audits, sandbox testing, and agent firewalls locally.
        </p>
      </header>

      <main className="grid" id="main-content">
        {/* Card 1: Production Safe Mode */}
        <section className="card" aria-label="Production Safe Mode">
          <h2>Production Safe Mode</h2>
          <p>Locks the main branch. All commits must pass <code>soloknuckle check</code>.</p>
          <div style={{ flex: 1, marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>
              <strong>Pre-push Hooks</strong>
              <div className={`toggle-track ${hooksEnabled ? 'active' : ''}`} onClick={() => setHooksEnabled(!hooksEnabled)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHooksEnabled(!hooksEnabled); } }} role="switch" aria-checked={hooksEnabled} tabIndex={0} aria-label="Toggle Pre-push hooks">
                <div className="toggle-thumb" style={{ transform: hooksEnabled ? 'translateX(24px)' : 'translateX(0)' }}></div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>AI Direct Commits</strong>
              <div className={`toggle-track ${aiCommitsEnabled ? 'active' : ''}`} onClick={() => setAiCommitsEnabled(!aiCommitsEnabled)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAiCommitsEnabled(!aiCommitsEnabled); } }} role="switch" aria-checked={aiCommitsEnabled} tabIndex={0} aria-label="Toggle AI Direct Commits">
                <div className="toggle-thumb" style={{ transform: aiCommitsEnabled ? 'translateX(24px)' : 'translateX(0)' }}></div>
              </div>
            </div>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={async () => { setSafeModeStatus('Saving...'); try { await fetch('/api/safe-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hooksEnabled, aiCommitsEnabled }) }); setSafeModeStatus('Config Saved'); } catch { setSafeModeStatus('Error saving'); } setTimeout(() => setSafeModeStatus(''), 3000); }}>Save Config</button>
          {safeModeStatus && <p style={{ fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.5rem' }}>{safeModeStatus}</p>}
        </section>

        {/* Card 2: Multi-Provider LLM Setup */}
        <div className="card" style={{ backgroundColor: 'var(--tertiary)' }}>
          <h2>LLM Provider Setup</h2>
          <p>Add multiple AI providers. Only one is active at a time for audits and suggestions.</p>

          {/* Active provider badge */}
          <div style={{ background: '#000', color: 'var(--secondary)', padding: '0.6rem 1rem', fontWeight: 900, fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: '1rem', marginBottom: '1rem', boxShadow: '4px 4px 0 var(--primary)' }}>
            Active: {activeProviderName}
          </div>

          {/* Provider list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, marginBottom: '1rem' }}>
            {providers.length === 0 && <p style={{ fontSize: '0.9rem', fontStyle: 'italic', opacity: 0.6 }}>No providers configured yet.</p>}
            {providers.map((prov) => (
              <div key={prov.id} className="provider-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: prov.id === activeProviderId ? 'var(--secondary)' : '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '0.75rem 1rem', boxShadow: '3px 3px 0 #000' }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.95rem' }}>{prov.name}</strong>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, fontFamily: 'monospace' }}>{prov.type} — {prov.model}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {prov.id !== activeProviderId && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={() => handleActivateProvider(prov.id)} aria-label={`Activate ${prov.name}`}>Activate</button>
                  )}
                  <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={() => handleTestProvider(prov.id)} disabled={testingProviderId === prov.id} aria-label={`Test ${prov.name}`}>
                    {testingProviderId === prov.id ? '...' : 'Test'}
                  </button>
                  <button className="btn" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', backgroundColor: '#ef4444', color: '#fff' }} onClick={() => handleDeleteProvider(prov.id)} aria-label={`Delete ${prov.name}`}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          {/* Add provider form */}
          {!showAddProvider ? (
            <button className="btn" style={{ width: '100%', backgroundColor: '#000', color: 'var(--secondary)' }} onClick={() => setShowAddProvider(true)}>
              + Add Provider
            </button>
          ) : (
            <div style={{ background: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1rem', boxShadow: '4px 4px 0 #000' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.95rem' }}>New Provider</strong>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '1.1rem' }} onClick={() => setShowAddProvider(false)} aria-label="Cancel adding provider">&times;</button>
              </div>
              <label htmlFor="provider-name" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 800, fontSize: '0.85rem' }}>Name</label>
              <input id="provider-name" placeholder="e.g. Work OpenAI" value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }} />
              <label htmlFor="provider-type" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 800, fontSize: '0.85rem' }}>Provider Type</label>
              <select id="provider-type" value={newProviderType} onChange={(e) => setNewProviderType(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '0.75rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
                {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {newProviderType !== 'Ollama (Local)' && (
                <>
                  <label htmlFor="provider-api-key" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 800, fontSize: '0.85rem' }}>API Key</label>
                  <input id="provider-api-key" type="password" placeholder="Enter API Key" value={newProviderKey} onChange={(e) => setNewProviderKey(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '0.75rem' }} />
                </>
              )}
              {(showProviderUrl) && (
                <>
                  <label htmlFor="provider-base-url" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 800, fontSize: '0.85rem' }}>Base URL</label>
                  <input id="provider-base-url" placeholder={PROVIDER_DEFAULTS[newProviderType]?.baseUrl || ''} value={newProviderBaseUrl} onChange={(e) => setNewProviderBaseUrl(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '0.75rem', fontSize: '0.9rem' }} />
                </>
              )}
              <label htmlFor="provider-model" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 800, fontSize: '0.85rem' }}>Model <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <input id="provider-model" placeholder={PROVIDER_DEFAULTS[newProviderType]?.model || ''} value={newProviderModel} onChange={(e) => setNewProviderModel(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: 'var(--border-width) solid var(--border-color)', marginBottom: '0.75rem' }} />
              <button className="btn" style={{ width: '100%', backgroundColor: '#000', color: 'var(--secondary)' }} onClick={handleAddProvider}>Save Provider</button>
            </div>
          )}
          {providerStatus && <p style={{ fontWeight: 'bold', color: providerStatus.startsWith('Connection OK') || providerStatus === 'Provider activated!' || providerStatus === 'Provider added!' ? 'green' : 'var(--primary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>{providerStatus}</p>}
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
          <p>Run commands in a restricted sandbox. Only whitelisted commands are allowed.</p>
          <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="sandbox-code" className="sr-only">Sandbox Code</label>
            <textarea id="sandbox-code" className="text-area" placeholder="e.g. npm run build && npm run test" value={sandboxCode} onChange={(e) => setSandboxCode(e.target.value)} aria-label="Command to run in sandbox"></textarea>
            {sandboxResult && (
              <pre style={{ background: '#fff', color: '#000', padding: '1rem', overflowX: 'auto', border: 'var(--border-width) solid var(--border-color)', fontSize: '0.8rem', marginTop: '1rem', boxShadow: '4px 4px 0 #000', maxHeight: '200px', overflowY: 'auto' }}>
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
          <p>Real-time feed of intercepted and blocked destructive actions.</p>
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
                <button className="btn" style={{ width: '100%', marginTop: '1rem', backgroundColor: '#000', color: 'var(--secondary)' }} onClick={handleGenerateSuggestions} disabled={isAnalyzing}>
                  {isAnalyzing ? 'Analyzing with LLM...' : 'Generate AI Suggestions'}
                </button>
              )}
              {aiSuggestions && (
                <div style={{ background: 'var(--primary)', color: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1rem', marginTop: '1rem', boxShadow: '4px 4px 0 #000' }}>
                  <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '0.5rem' }}>AI Action Plan</strong>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
                    {aiSuggestions.map((s, idx) => <li key={idx} style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{s}</li>)}
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
          <p>Automated static analysis based on AGENTS.md rules.</p>
          <div style={{ background: 'var(--primary)', color: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1.5rem', marginTop: '1rem', flex: 1, boxShadow: '4px 4px 0 #000' }}>
            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '0.5rem' }}>[Violation Detected]</strong>
            <p style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', fontWeight: 'bold' }}>Direct modification of main branch detected in local git state.</p>
            <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Suggested Fix:</strong>
            <code style={{ display: 'block', background: '#000', color: 'var(--secondary)', padding: '0.75rem', border: 'var(--border-width) solid var(--border-color)', fontSize: '0.9rem', fontWeight: 'bold' }}>
              git checkout -b feature/your-feature-name
            </code>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem', backgroundColor: '#fff', color: '#000' }} onClick={() => alert('Violation acknowledged. Apply the suggested fix before committing.')}>Acknowledge</button>
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
          <p>Assign directory-specific rules for specialized AI behavior.</p>
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
          <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={async () => { setPersonaStatus('Applying...'); try { const res = await fetch('/api/personas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDir: personaTargetDir, personaProfile }) }); setPersonaStatus(res.ok ? 'Persona Applied!' : 'Failed to apply.'); } catch { setPersonaStatus('Error.'); } setTimeout(() => setPersonaStatus(''), 3000); }}>Apply Persona</button>
          {personaStatus && <p style={{ fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.5rem' }}>{personaStatus}</p>}
        </section>
      </main>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section style={{ marginTop: '4rem', padding: '2rem', border: 'var(--border-width) solid var(--border-color)', background: 'var(--secondary)', boxShadow: '6px 6px 0 #000' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.8rem' }}>How It Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {[
            { step: '01', title: 'Install & Initialize', desc: 'Run `npx soloknuckle init` in your project. This installs git hooks and creates your config at ~/.soloknuckle/config.json — everything runs locally, no cloud service required.', icon: '⚙' },
            { step: '02', title: 'Connect Your LLM', desc: 'Add one or more AI providers — OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, or run fully offline with Ollama. Test each connection with one click. Switch providers instantly.', icon: '🔗' },
            { step: '03', title: 'Pre-commit Firewall', desc: 'Every `git commit` is scanned by your active LLM against AGENTS.md rules. Secrets, PII, destructive commands, missing tests, and style violations are blocked automatically before they reach your repo.', icon: '🛡' },
            { step: '04', title: 'Audit & Improve', desc: 'Run `soloknuckle audit` or use this dashboard to score your codebase on Quality, Testing, Security, Efficiency, and Accessibility — then get AI-powered fix suggestions ranked by impact.', icon: '📊' },
            { step: '05', title: 'Monitor & Enforce', desc: 'The Agent Firewall logs every intercepted attempt in real-time. The Persona Manager generates role-specific rules for your team. Telemetry tracks AI vs Human contributions across your codebase.', icon: '👁' },
          ].map(({ step, title, desc, icon }) => (
            <div key={step} style={{ background: '#fff', border: 'var(--border-width) solid var(--border-color)', padding: '1.5rem', boxShadow: '3px 3px 0 #000' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ width: '42px', height: '42px', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', flexShrink: 0 }}>{step}</div>
                <strong style={{ fontSize: '1.1rem' }}>{icon} {title}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section style={{ marginTop: '3rem', marginBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.8rem' }}>Frequently Asked Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[
            { q: 'Is Soloknuckle free?', a: 'Yes. The CLI and dashboard are completely free and open source. The only cost is your LLM API usage — and you can avoid even that by using Ollama locally for zero cost and full privacy.' },
            { q: 'Do I need an API key?', a: 'Only for cloud LLM providers (OpenAI, Anthropic, etc.). If you use Ollama running locally, no API key is needed. Most features — scoring, sandbox, firewall — work without any LLM at all.' },
            { q: 'Can I use multiple providers at once?', a: 'You can add as many providers as you like, but only one is active at a time for audits and suggestions. Switch instantly by clicking "Activate" on any saved provider. This lets you compare providers or use different ones for different projects.' },
            { q: 'What is the Agent Sandbox?', a: 'A command whitelist that restricts what the UI can execute. Only pre-approved commands like `npm test` and `git status` are allowed. Destructive commands (rm -rf, force push, SQL drops, etc.) are blocked before they run.' },
            { q: 'What is the Agent Firewall?', a: 'It intercepts any command attempted through the sandbox and blocks 26+ destructive patterns — sudo rm, force push, SQL drops, chmod 777, piping remote scripts to shell, and more. Every blocked attempt is logged in the dashboard in real-time.' },
            { q: 'Does this replace my linter or test runner?', a: 'No. Soloknuckle wraps your existing tools. It reads your `npm run lint` and `npm run test` output to generate Quality, Testing, Security, Efficiency, and Accessibility scores — then sends those scores to your LLM for actionable suggestions.' },
            { q: 'Can I use this with Cursor / Windsurf / Codex?', a: 'Yes. Soloknuckle installs `.cursorrules` files and pre-commit hooks that work alongside any AI coding assistant. The Persona Manager generates role-specific rules (Frontend UX, Backend Security, Data Engineer) for each IDE.' },
            { q: 'Do I need the UI dashboard?', a: 'No. The CLI (`npx soloknuckle check`, `soloknuckle audit`) does everything the UI does. The dashboard is a visual convenience for monitoring, config, and quick testing — entirely optional.' },
            { q: 'What providers are supported?', a: 'OpenAI, Anthropic, Google Gemini, DeepSeek, Mistral, Groq, xAI (Grok), OpenRouter, Cohere, any OpenAI-compatible API (LM Studio, vLLM, LocalAI), and Ollama for fully local/private inference. You can add multiple instances of the same provider with different keys or models.' },
            { q: 'Where is my data stored?', a: 'Everything stays local. Your config is at ~/.soloknuckle/config.json. No telemetry is sent anywhere. The LLM providers you configure receive prompts only when you run audits — nothing is sent in the background.' },
            { q: 'What happens if the LLM is unavailable?', a: 'Scoring and suggestions will fail gracefully. The firewall, sandbox, and pre-commit hooks continue to work without an LLM. The dashboard shows "Backend unavailable" for LLM-dependent features and you can retry when your provider is back.' },
          ].map(({ q, a }, idx) => (
            <details key={idx} style={{ border: 'var(--border-width) solid var(--border-color)', background: '#fff', boxShadow: '3px 3px 0 #000' }}>
              <summary style={{ padding: '1rem 1.25rem', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{q}</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, flexShrink: 0, marginLeft: '1rem' }}>+</span>
              </summary>
              <div style={{ padding: '0 1.25rem 1rem', fontSize: '0.95rem', lineHeight: 1.7, borderTop: '2px solid #000', paddingTop: '0.75rem' }}>
                {a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '2rem 0', borderTop: '2px solid #000', marginTop: '1rem' }}>
        <p style={{ fontWeight: 800, fontSize: '0.85rem', opacity: 0.5 }}>SOLOKNUCKLE v0.1.0 — Production Hygiene, Enforced Locally.</p>
      </footer>
    </div>
  );
}

export default App;
