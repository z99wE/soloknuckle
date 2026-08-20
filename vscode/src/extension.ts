import * as vscode from 'vscode';
import * as cp from 'child_process';
import { DashboardProvider } from './dashboard';
import { ViolationsProvider, ViolationItem } from './violations';
import { ScoreStatusBar } from './statusbar';
import { DiagnosticsProvider } from './diagnostics';

let outputChannel: vscode.OutputChannel;
let statusBarItem: ScoreStatusBar;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  outputChannel = vscode.window.createOutputChannel('Soloknuckle');
  statusBarItem = new ScoreStatusBar();

  const dashboardProvider = new DashboardProvider(context.extensionUri);
  const violationsProvider = new ViolationsProvider();
  const diagnosticsProvider = new DiagnosticsProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('soloknuckle.dashboard', dashboardProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerTreeDataProvider('soloknuckle.violations', violationsProvider),
    statusBarItem,
    outputChannel,
    diagnosticsProvider,
  );

  registerCommands(context, dashboardProvider, violationsProvider, diagnosticsProvider);

  const config = vscode.workspace.getConfiguration('soloknuckle');
  if (config.get<boolean>('autoCheck', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme === 'file' && !doc.uri.path.includes('node_modules')) {
          runCheck(context, violationsProvider, diagnosticsProvider, false);
        }
      })
    );
  }

  runCheck(context, violationsProvider, diagnosticsProvider, false);
}

function registerCommands(
  context: vscode.ExtensionContext,
  dashboardProvider: DashboardProvider,
  violationsProvider: ViolationsProvider,
  diagnosticsProvider: DiagnosticsProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('soloknuckle.check', () =>
      runCheck(context, violationsProvider, diagnosticsProvider, true)
    ),
    vscode.commands.registerCommand('soloknuckle.init', () => runInit()),
    vscode.commands.registerCommand('soloknuckle.audit', () =>
      runAudit(violationsProvider, diagnosticsProvider)
    ),
    vscode.commands.registerCommand('soloknuckle.fix', () => runFix()),
    vscode.commands.registerCommand('soloknuckle.dashboard', () => {
      vscode.commands.executeCommand('soloknuckle.dashboard.focus');
    }),
    vscode.commands.registerCommand('soloknuckle.score', () => showScoreQuickPick()),
    vscode.commands.registerCommand('soloknuckle.refresh', () => {
      runCheck(context, violationsProvider, diagnosticsProvider, true);
      dashboardProvider.refresh();
    }),
  );
}

function getCliPath(): string {
  const config = vscode.workspace.getConfiguration('soloknuckle');
  const customPath = config.get<string>('cliPath', '');
  if (customPath) return customPath;
  return 'soloknuckle';
}

function runSoloknuckle(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = getCliPath();
  return new Promise((resolve) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workDir = cwd || workspaceFolder?.uri.fsPath || process.cwd();

    const child = cp.execFile(cliPath, args, {
      cwd: workDir,
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: '0' },
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: Number(error?.code) || child.exitCode || 0,
      });
    });
  });
}

async function runCheck(
  context: vscode.ExtensionContext,
  violationsProvider: ViolationsProvider,
  diagnosticsProvider: DiagnosticsProvider,
  showOutput: boolean
) {
  if (showOutput) {
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine('Running soloknuckle check...');
  }

  statusBarItem.setChecking();

  try {
    const { stdout, stderr } = await runSoloknuckle(['check', '--json']);

    if (stderr && !stdout) {
      if (showOutput) outputChannel.appendLine(`Error: ${stderr}`);
      statusBarItem.setError();
      return;
    }

    let result: any;
    try {
      result = JSON.parse(stdout);
    } catch {
      if (showOutput) {
        outputChannel.appendLine(stdout);
        if (stderr) outputChannel.appendLine(stderr);
      }
      statusBarItem.setError();
      return;
    }

    statusBarItem.updateScore(result.overall || 0);

    const violations: ViolationItem[] = [];
    if (result.suggestions) {
      for (const s of result.suggestions) {
        violations.push({
          dimension: s.dimension || 'General',
          message: s.message || s.text || 'Unknown issue',
          severity: s.severity || 'warning',
          file: s.file,
          line: s.line,
        });
      }
    }
    violationsProvider.setItems(violations);
    diagnosticsProvider.update(violations);

    context.workspaceState.update('lastCheck', {
      score: result.overall,
      timestamp: Date.now(),
      violations: violations.length,
    });

    if (showOutput) {
      outputChannel.appendLine(`\nScore: ${result.overall}/100`);
      outputChannel.appendLine(`Violations: ${violations.length}`);
      if (violations.length === 0) {
        outputChannel.appendLine('\n✓ All checks passed!');
      } else {
        for (const v of violations) {
          const loc = v.file ? ` (${v.file}${v.line ? `:${v.line}` : ''})` : '';
          outputChannel.appendLine(`  [${v.severity}] ${v.dimension}: ${v.message}${loc}`);
        }
      }
    }
  } catch (err: any) {
    if (showOutput) outputChannel.appendLine(`Failed: ${err.message}`);
    statusBarItem.setError();
  }
}

async function runInit() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const result = await vscode.window.showInformationMessage(
    'Initialize Soloknuckle in this project?',
    'Initialize',
    'Cancel'
  );

  if (result !== 'Initialize') return;

  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine('Initializing Soloknuckle...');

  try {
    const { stdout, stderr } = await runSoloknuckle(['init']);
    outputChannel.appendLine(stdout);
    if (stderr) outputChannel.appendLine(stderr);
    outputChannel.appendLine('\n✓ Soloknuckle initialized!');
    vscode.window.showInformationMessage('Soloknuckle initialized successfully!');
  } catch (err: any) {
    outputChannel.appendLine(`Failed: ${err.message}`);
    vscode.window.showErrorMessage(`Initialization failed: ${err.message}`);
  }
}

async function runAudit(
  violationsProvider: ViolationsProvider,
  diagnosticsProvider: DiagnosticsProvider
) {
  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine('Running full audit...\n');

  statusBarItem.setChecking();

  try {
    const { stdout, stderr } = await runSoloknuckle(['audit', '--json']);

    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        statusBarItem.updateScore(result.overall || 0);
        outputChannel.appendLine(JSON.stringify(result, null, 2));
      } catch {
        outputChannel.appendLine(stdout);
      }
    }
    if (stderr) outputChannel.appendLine(stderr);
  } catch (err: any) {
    outputChannel.appendLine(`Failed: ${err.message}`);
    statusBarItem.setError();
  }
}

async function runFix() {
  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine('Running auto-fix...\n');

  try {
    const { stdout, stderr } = await runSoloknuckle(['check', '--fix']);
    outputChannel.appendLine(stdout);
    if (stderr) outputChannel.appendLine(stderr);
    outputChannel.appendLine('\n✓ Auto-fix complete!');
    vscode.window.showInformationMessage('Soloknuckle auto-fix complete!');
  } catch (err: any) {
    outputChannel.appendLine(`Failed: ${err.message}`);
  }
}

async function showScoreQuickPick() {
  const lastCheck = extensionContext?.workspaceState.get<any>('lastCheck');
  if (lastCheck) {
    const age = Math.round((Date.now() - lastCheck.timestamp) / 1000);
    const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
    vscode.window.showInformationMessage(
      `Current Score: ${lastCheck.score}/100 (${lastCheck.violations} violations, checked ${ageStr})`
    );
  } else {
    vscode.window.showInformationMessage('No check results yet. Run "Soloknuckle: Run Health Check" first.');
  }
}

export function deactivate() {}
