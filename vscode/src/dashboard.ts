import * as vscode from 'vscode';
import { ViolationItem } from './violations';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'soloknuckle.dashboard';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'refresh':
          this.refresh();
          break;
        case 'runCheck':
          vscode.commands.executeCommand('soloknuckle.check');
          break;
        case 'openFile':
          if (message.path) {
            const uri = vscode.Uri.file(message.path);
            vscode.commands.executeCommand('vscode.open', uri);
          }
          break;
      }
    });
  }

  refresh() {
    if (this._view) {
      this._view.webview.postMessage({ type: 'refresh' });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <title>Soloknuckle Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      padding: 12px;
    }
    .score-ring {
      width: 120px;
      height: 120px;
      margin: 0 auto 16px;
      position: relative;
    }
    .score-ring svg {
      transform: rotate(-90deg);
      width: 120px;
      height: 120px;
    }
    .score-ring .bg {
      fill: none;
      stroke: var(--vscode-progressBar-background, #333);
      stroke-width: 8;
    }
    .score-ring .fg {
      fill: none;
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.8s ease;
    }
    .score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 28px;
      font-weight: 700;
    }
    .score-label {
      text-align: center;
      font-size: 12px;
      opacity: 0.7;
      margin-bottom: 16px;
    }
    .section {
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.6;
      margin-bottom: 6px;
    }
    .dimension {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }
    .dimension-bar {
      width: 60px;
      height: 4px;
      background: var(--vscode-progressBar-background, #333);
      border-radius: 2px;
      overflow: hidden;
      margin-left: 8px;
    }
    .dimension-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.5s ease;
    }
    .violation {
      padding: 6px 8px;
      margin: 4px 0;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      border-left: 3px solid;
    }
    .violation:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .violation.error {
      border-left-color: var(--vscode-errorForeground, #f44);
      background: rgba(255, 68, 68, 0.05);
    }
    .violation.warning {
      border-left-color: var(--vscode-editorWarning-foreground, #fc0);
      background: rgba(255, 204, 0, 0.05);
    }
    .violation.info {
      border-left-color: var(--vscode-editorInfo-foreground, #8cf);
      background: rgba(136, 204, 255, 0.05);
    }
    .violation-dim {
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      opacity: 0.7;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .empty {
      text-align: center;
      padding: 24px;
      opacity: 0.5;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="score-ring">
    <svg viewBox="0 0 120 120">
      <circle class="bg" cx="60" cy="60" r="50"></circle>
      <circle class="fg" id="score-arc" cx="60" cy="60" r="50"
        stroke-dasharray="314.16"
        stroke-dashoffset="314.16"></circle>
    </svg>
    <div class="score-value" id="score-value">--</div>
  </div>
  <div class="score-label" id="score-label">Loading...</div>

  <div class="section" id="dimensions-section" style="display:none">
    <div class="section-title">Dimensions</div>
    <div id="dimensions"></div>
  </div>

  <div class="section" id="violations-section" style="display:none">
    <div class="section-title">Violations</div>
    <div id="violations"></div>
  </div>

  <button class="btn" id="refresh-btn">Run Health Check</button>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = vscode.getState() || {};

    function scoreColor(score) {
      if (score >= 90) return '#4caf50';
      if (score >= 70) return '#ff9800';
      return '#f44336';
    }

    function updateScore(score) {
      const arc = document.getElementById('score-arc');
      const value = document.getElementById('score-value');
      const label = document.getElementById('score-label');
      const circumference = 2 * Math.PI * 50;
      const offset = circumference - (score / 100) * circumference;
      arc.style.stroke = scoreColor(score);
      arc.style.strokeDashoffset = offset;
      value.textContent = score;
      value.style.color = scoreColor(score);
      const texts = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Work' : 'Critical';
      label.textContent = texts;
    }

    function renderDimensions(dims) {
      const container = document.getElementById('dimensions');
      const section = document.getElementById('dimensions-section');
      if (!dims || dims.length === 0) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      container.innerHTML = dims.map(d => {
        const color = d.score >= 90 ? '#4caf50' : d.score >= 70 ? '#ff9800' : '#f44336';
        return '<div class="dimension"><span>' + d.name + '</span><div style="display:flex;align-items:center"><span style="opacity:0.6;font-size:11px;margin-right:6px">' + d.score + '</span><div class="dimension-bar"><div class="dimension-fill" style="width:' + d.score + '%;background:' + color + '"></div></div></div></div>';
      }).join('');
    }

    function renderViolations(violations) {
      const container = document.getElementById('violations');
      const section = document.getElementById('violations-section');
      if (!violations || violations.length === 0) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      container.innerHTML = violations.map(v => {
        const loc = v.file ? '<span style="opacity:0.5">' + v.file + (v.line ? ':' + v.line : '') + '</span>' : '';
        return '<div class="violation ' + v.severity + '" data-file="' + (v.file || '') + '" data-line="' + (v.line || 0) + '"><div class="violation-dim">' + v.dimension + '</div>' + v.message + ' ' + loc + '</div>';
      }).join('');

      container.querySelectorAll('.violation').forEach(el => {
        el.addEventListener('click', () => {
          const file = el.getAttribute('data-file');
          const line = parseInt(el.getAttribute('data-line') || '0');
          if (file) vscode.postMessage({ type: 'openFile', path: file, line });
        });
      });
    }

    if (state.score !== undefined) {
      updateScore(state.score);
      renderDimensions(state.dimensions);
      renderViolations(state.violations);
    }

    document.getElementById('refresh-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'runCheck' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'update') {
        state = msg.data;
        vscode.setState(state);
        updateScore(state.score);
        renderDimensions(state.dimensions);
        renderViolations(state.violations);
      } else if (msg.type === 'refresh') {
        vscode.postMessage({ type: 'runCheck' });
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
