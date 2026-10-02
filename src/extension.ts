import * as vscode from 'vscode';
import { createLogger } from './util/log';

/** P0: 빈 Topics 뷰만 등록한다. 데이터 계층과 트리는 P1·P2에서 구현한다. */
class EmptyTopicsProvider implements vscode.TreeDataProvider<never> {
  getTreeItem(element: never): vscode.TreeItem {
    return element;
  }

  getChildren(): never[] {
    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const log = createLogger();
  context.subscriptions.push(
    log,
    vscode.window.registerTreeDataProvider('arxivjs.topics', new EmptyTopicsProvider()),
  );
  log.info('ArxivJS Viewer activated');
}

export function deactivate(): void {}
