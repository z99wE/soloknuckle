import * as vscode from 'vscode';
import * as path from 'path';
import { ViolationItem } from './violations';

export class DiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('soloknuckle');
    this.disposables.push(this.diagnosticCollection);
  }

  update(violations: ViolationItem[]) {
    const byFile = new Map<string, vscode.Diagnostic[]>();

    for (const v of violations) {
      if (!v.file) continue;

      const absolutePath = path.isAbsolute(v.file) ? v.file : path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        v.file
      );

      const line = (v.line || 1) - 1;
      const range = new vscode.Range(line, 0, line, 1000);

      const severity = v.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                       v.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                       vscode.DiagnosticSeverity.Information;

      const diagnostic = new vscode.Diagnostic(
        range,
        `[${v.dimension}] ${v.message}`,
        severity
      );
      diagnostic.source = 'soloknuckle';
      diagnostic.code = v.dimension;

      const existing = byFile.get(absolutePath) || [];
      existing.push(diagnostic);
      byFile.set(absolutePath, existing);
    }

    this.diagnosticCollection.clear();
    for (const [file, diagnostics] of byFile) {
      this.diagnosticCollection.set(vscode.Uri.file(file), diagnostics);
    }
  }

  dispose() {
    this.diagnosticCollection.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
