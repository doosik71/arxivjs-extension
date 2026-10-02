import * as path from 'node:path';
import * as vscode from 'vscode';
import { CONFIG_SECTION, readConfig, saveDataFolder, type ArxivjsConfig } from './config';
import { Library } from './data/library';
import { nodeReadonlyFs } from './data/readonlyFs';
import { createLogger } from './util/log';
import { TOPICS_VIEW_ID, TopicTreeProvider, type TreeNode } from './views/topicTreeProvider';

/** 통합 테스트용으로 노출하는 내부 API */
export interface ArxivjsApi {
  readonly tree: TopicTreeProvider;
  getLibrary(): Library | undefined;
}

export function activate(context: vscode.ExtensionContext): ArxivjsApi {
  const log = createLogger();
  let config: ArxivjsConfig = readConfig();
  let library: Library | undefined;

  const createLibrary = () => {
    library = config.dataFolder ? new Library(config.dataFolder, nodeReadonlyFs, log, () => config.paperSort) : undefined;
    log.info(`데이터 폴더: ${config.dataFolder ?? '(설정 안 됨)'}`);
  };
  createLibrary();

  const tree = new TopicTreeProvider(() => library, () => config.dataFolderRaw !== '', log);
  const treeView = vscode.window.createTreeView<TreeNode>(TOPICS_VIEW_ID, { treeDataProvider: tree, showCollapseAll: true });
  const updateViewDescription = () => {
    treeView.description = config.dataFolder ? path.basename(config.dataFolder) : undefined;
  };
  updateViewDescription();

  context.subscriptions.push(
    log,
    tree,
    treeView,

    vscode.commands.registerCommand('arxivjs.selectDataFolder', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '데이터 폴더로 사용',
        title: 'arxivjs 데이터 폴더 선택',
        defaultUri: config.dataFolder ? vscode.Uri.file(config.dataFolder) : undefined,
      });
      if (!picked?.[0]) {
        return;
      }
      const folder = picked[0].fsPath;
      if (folder === config.dataFolder) {
        tree.reloadAll(); // 같은 폴더를 다시 고르면 설정 변경 이벤트가 없으므로 직접 다시 읽는다.
      } else {
        await saveDataFolder(folder);
      }
    }),

    vscode.commands.registerCommand('arxivjs.reload', () => {
      log.info('Reload: 전체');
      tree.reloadAll();
    }),

    vscode.commands.registerCommand('arxivjs.reloadTopic', (node?: TreeNode) => {
      if (node?.kind === 'topic') {
        log.info(`Reload: 주제 ${node.topic.id}`);
        tree.reloadTopic(node.topic.id);
      }
    }),

    vscode.commands.registerCommand('arxivjs.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`),
    ),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      const previous = config;
      config = readConfig();
      if (config.dataFolder !== previous.dataFolder || config.dataFolderRaw !== previous.dataFolderRaw) {
        createLibrary();
        updateViewDescription();
        tree.reloadAll();
      } else if (config.paperSort !== previous.paperSort) {
        tree.refresh(); // 캐시는 그대로 두고 정렬만 다시 한다.
      }
    }),
  );

  log.info('ArxivJS Viewer activated');
  return { tree, getLibrary: () => library };
}

export function deactivate(): void {}
