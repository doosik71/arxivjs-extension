import * as path from 'node:path';
import * as vscode from 'vscode';
import { CONFIG_SECTION, readConfig, saveDataFolder, type ArxivjsConfig } from './config';
import { Library } from './data/library';
import type { Paper, Topic } from './data/models';
import { nodeReadonlyFs } from './data/readonlyFs';
import { createLogger } from './util/log';
import { citationText, paperDescription } from './views/format';
import { HomePanelManager } from './views/homePanel';
import { openExternalUrl, PaperPanelManager } from './views/paperPanel';
import { TopicPanelManager } from './views/topicPanel';
import { TOPICS_VIEW_ID, TopicTreeProvider, type TreeNode } from './views/topicTreeProvider';

/** 통합 테스트용으로 노출하는 내부 API */
export interface ArxivjsApi {
  readonly tree: TopicTreeProvider;
  readonly panels: PaperPanelManager;
  readonly topicPanel: TopicPanelManager;
  readonly home: HomePanelManager;
  getLibrary(): Library | undefined;
}

interface PaperTarget {
  topic: Topic;
  paper: Paper;
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

  const revealTopic = async (topicId: string) => {
    if (!tree.getTopicNode(topicId)) {
      await tree.getChildren(); // 트리를 아직 그리지 않았으면 주제 노드를 만든다.
    }
    const node = tree.getTopicNode(topicId);
    if (node) {
      await treeView.reveal(node, { select: true, focus: true, expand: true });
    }
  };

  const panels = new PaperPanelManager(
    context.extensionUri,
    {
      getLibrary: () => library,
      openInNewTab: () => config.openInNewTab,
      revealTopic: (topicId) => void revealTopic(topicId),
      onPaperReloaded: (topicId) => {
        tree.refreshTopic(topicId);
        void topicPanel.refresh(topicId);
        void home.refresh();
      },
    },
    log,
  );

  /** 논문을 열 위치 (설정 arxivjs.paperPanelLocation). anchor는 논문 목록이 있는 편집기 그룹 */
  const paperPlacement = (anchor?: vscode.ViewColumn) => ({ location: config.paperPanelLocation, anchor });

  /** 전체 Reload: 캐시를 비우고 트리, 홈, Topic 패널을 다시 그린다. */
  const reloadAll = () => {
    log.info('Reload: 전체');
    tree.reloadAll();
    void topicPanel.refresh();
    void home.refresh();
  };

  /** 주제 Reload: 그 주제의 캐시를 비우고 트리 노드, 홈, (보고 있으면) Topic 패널을 다시 그린다. */
  const reloadTopic = (topicId: string) => {
    log.info(`Reload: 주제 ${topicId}`);
    tree.reloadTopic(topicId);
    void topicPanel.refresh(topicId);
    void home.refresh();
  };

  const topicPanel = new TopicPanelManager(
    context.extensionUri,
    {
      getLibrary: () => library,
      defaultSort: () => config.paperSort,
      openPaper: (topic, paper) => void panels.show(topic, paper, paperPlacement(topicPanel.viewColumn)),
      reloadTopic,
    },
    log,
  );

  const home = new HomePanelManager(
    context.extensionUri,
    {
      getLibrary: () => library,
      configuredFolder: () => config.dataFolderRaw,
      openTopic: (topic) => void topicPanel.show(topic),
      selectDataFolder: () => void vscode.commands.executeCommand('arxivjs.selectDataFolder'),
      reloadAll,
    },
    log,
  );

  /** ArxivJS 뷰를 처음 열 때 홈을 연다 (설정 arxivjs.openHomeOnStartup). 세션에 한 번만. */
  let homeOpenedOnStartup = false;
  const openHomeOnStartup = () => {
    if (!homeOpenedOnStartup && config.openHomeOnStartup && !home.isOpen) {
      homeOpenedOnStartup = true;
      void home.show({ preserveFocus: true });
    }
  };

  /** 명령 대상 논문: 인자로 받은 트리 노드 → 활성 Paper 패널 → 트리에서 선택한 논문 */
  const resolvePaper = (node?: TreeNode): PaperTarget | undefined => {
    const pick = (n?: TreeNode) => (n?.kind === 'paper' ? { topic: n.parent.topic, paper: n.paper } : undefined);
    return pick(node) ?? panels.activePaper ?? pick(treeView.selection[0]);
  };

  /** 주제 QuickPick */
  const pickTopic = async (title: string): Promise<Topic | undefined> => {
    if (!library) {
      void vscode.window.showWarningMessage('ArxivJS: 데이터 폴더를 먼저 설정하세요.');
      return undefined;
    }
    const picked = await vscode.window.showQuickPick<vscode.QuickPickItem & { topic: Topic }>(
      library.topics.list().then((topics) => topics.map((t) => ({ label: t.label, description: t.id, topic: t }))),
      { title, placeHolder: '주제 이름으로 검색', matchOnDescription: true },
    );
    return picked?.topic;
  };

  /** 인자 없이 "논문 열기"를 실행하면 주제 → 논문 순으로 고른다. */
  const pickPaper = async (): Promise<PaperTarget | undefined> => {
    const lib = library;
    const topic = await pickTopic('논문 열기: 주제 선택');
    if (!topic || !lib) {
      return undefined;
    }
    const paper = await vscode.window.showQuickPick<vscode.QuickPickItem & { paper: Paper }>(
      lib.papers.list(topic).then((papers) =>
        papers.map((p) => ({ label: p.meta.title, description: paperDescription(p), detail: p.meta.authors, paper: p })),
      ),
      { title: `논문 열기: ${topic.label}`, placeHolder: '제목이나 저자로 검색', matchOnDescription: true, matchOnDetail: true },
    );
    return paper && { topic, paper: paper.paper };
  };

  context.subscriptions.push(
    log,
    tree,
    treeView,
    panels,
    topicPanel,
    home,

    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        openHomeOnStartup();
      }
    }),

    vscode.commands.registerCommand('arxivjs.openHome', () => home.show()),

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
        reloadAll(); // 같은 폴더를 다시 고르면 설정 변경 이벤트가 없으므로 직접 다시 읽는다.
      } else {
        await saveDataFolder(folder);
      }
    }),

    vscode.commands.registerCommand('arxivjs.reload', () => reloadAll()),

    vscode.commands.registerCommand('arxivjs.reloadTopic', (node?: TreeNode) => {
      if (node?.kind === 'topic') {
        reloadTopic(node.topic.id);
      }
    }),

    vscode.commands.registerCommand('arxivjs.reloadPaper', () => panels.reload()),

    vscode.commands.registerCommand('arxivjs.openTopic', async (node?: TreeNode) => {
      const topic = node?.kind === 'topic' ? node.topic : await pickTopic('주제 열기');
      if (topic) {
        await topicPanel.show(topic);
      }
    }),

    vscode.commands.registerCommand('arxivjs.openPaper', async (node?: TreeNode) => {
      const target = node?.kind === 'paper' ? resolvePaper(node) : await pickPaper();
      if (target) {
        await panels.show(target.topic, target.paper, paperPlacement());
      }
    }),

    vscode.commands.registerCommand('arxivjs.openExternal', async (node?: TreeNode) => {
      const url = resolvePaper(node)?.paper.meta.url;
      if (url) {
        await openExternalUrl(url, log);
      } else {
        void vscode.window.showInformationMessage('ArxivJS: 이 논문에는 URL이 없습니다.');
      }
    }),

    vscode.commands.registerCommand('arxivjs.copyCitationInfo', async (node?: TreeNode) => {
      const target = resolvePaper(node);
      if (target) {
        await vscode.env.clipboard.writeText(citationText(target.paper));
        void vscode.window.setStatusBarMessage('ArxivJS: 논문 정보를 복사했습니다.', 3000);
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
        panels.closeAll(); // 다른 데이터 폴더의 내용을 계속 보여주지 않는다.
        topicPanel.closeAll();
        createLibrary();
        updateViewDescription();
        tree.reloadAll();
        void home.refresh(); // 홈은 닫지 않고 새 데이터 폴더의 주제로 다시 그린다.
      } else if (config.paperSort !== previous.paperSort) {
        tree.refresh(); // 캐시는 그대로 두고 정렬만 다시 한다.
      }
    }),
  );

  // 뷰가 보여서 활성화된 경우 (onDidChangeVisibility가 이미 지나갔을 수 있다)
  if (treeView.visible) {
    openHomeOnStartup();
  }

  log.info('ArxivJS Viewer activated');
  return { tree, panels, topicPanel, home, getLibrary: () => library };
}

export function deactivate(): void {}
