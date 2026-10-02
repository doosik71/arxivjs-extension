import * as vscode from 'vscode';

/** 출력 채널 "ArxivJS" */
export function createLogger(): vscode.LogOutputChannel {
  return vscode.window.createOutputChannel('ArxivJS', { log: true });
}
