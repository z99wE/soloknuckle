import * as vscode from 'vscode';
import * as path from 'path';

export interface ViolationItem {
  dimension: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

export class ViolationsProvider implements vscode.TreeDataProvider<ViolationNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ViolationNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: ViolationItem[] = [];

  setItems(items: ViolationItem[]) {
    this.items = items;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ViolationNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ViolationNode): ViolationNode[] {
    if (!element) {
      if (this.items.length === 0) {
        return [new ViolationNode('No violations found', 'info', vscode.TreeItemCollapsibleState.None)];
      }

      const byDimension = new Map<string, ViolationItem[]>();
      for (const item of this.items) {
        const existing = byDimension.get(item.dimension) || [];
        existing.push(item);
        byDimension.set(item.dimension, existing);
      }

      const nodes: ViolationNode[] = [];
      for (const [dim, items] of byDimension) {
        const node = new ViolationNode(
          `${dim} (${items.length})`,
          items.some(i => i.severity === 'error') ? 'error' : 'warning',
          vscode.TreeItemCollapsibleState.Expanded
        );
        node.children = items.map(i => new ViolationNode(
          i.message,
          i.severity,
          vscode.TreeItemCollapsibleState.None,
          i.file,
          i.line
        ));
        nodes.push(node);
      }
      return nodes;
    }

    return element.children || [];
  }

  getParent(element: ViolationNode): ViolationNode | undefined {
    return element.parent;
  }
}

class ViolationNode extends vscode.TreeItem {
  children: ViolationNode[] = [];
  parent?: ViolationNode;

  constructor(
    label: string,
    severity: 'error' | 'warning' | 'info',
    collapsibleState: vscode.TreeItemCollapsibleState,
    file?: string,
    line?: number
  ) {
    super(label, collapsibleState);

    const iconMap = {
      error: 'error',
      warning: 'warning',
      info: 'info',
    } as const;

    this.iconPath = new vscode.ThemeIcon(iconMap[severity]);

    if (file) {
      const absolutePath = path.isAbsolute(file) ? file : path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        file
      );
      this.resourceUri = vscode.Uri.file(absolutePath);
      if (line) {
        this.description = `${path.basename(file)}:${line}`;
        this.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [vscode.Uri.file(absolutePath), {
            selection: new vscode.Range(line - 1, 0, line - 1, 0)
          }],
        };
      } else {
        this.description = path.basename(file);
        this.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [vscode.Uri.file(absolutePath)],
        };
      }
    }

    this.contextValue = severity;
  }
}
