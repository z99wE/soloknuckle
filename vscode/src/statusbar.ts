import * as vscode from 'vscode';

export class ScoreStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'soloknuckle.score';
    this.item.tooltip = 'Soloknuckle Health Score';
    this.setIdle();
    this.item.show();
  }

  updateScore(score: number) {
    const icon = score >= 90 ? '$(pass-filled)' : score >= 70 ? '$(warning)' : '$(error)';
    const color = score >= 90 ? new vscode.ThemeColor('testing.iconPassed') :
                  score >= 70 ? new vscode.ThemeColor('testing.iconQueued') :
                  new vscode.ThemeColor('testing.iconFailed');
    this.item.text = `${icon} ${score}/100`;
    this.item.color = color;
    this.item.tooltip = `Soloknuckle: ${score}/100 — click to view`;
  }

  setChecking() {
    this.item.text = '$(sync~spin) Checking...';
    this.item.color = undefined;
    this.item.tooltip = 'Soloknuckle: running health check...';
  }

  setError() {
    this.item.text = '$(error) Error';
    this.item.color = new vscode.ThemeColor('testing.iconFailed');
    this.item.tooltip = 'Soloknuckle: check failed — click to retry';
  }

  setIdle() {
    this.item.text = '$(shield) Soloknuckle';
    this.item.color = undefined;
    this.item.tooltip = 'Soloknuckle — click to run health check';
  }

  dispose() {
    this.item.dispose();
  }
}
