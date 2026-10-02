import * as vscode from 'vscode';
import { DataError, isNotFound } from '../data/errors';
import type { Library } from '../data/library';
import type { Paper, Topic } from '../data/models';
import type { Logger } from '../util/logger';
import { paperDescription, paperTooltipLines, topicDescription } from './format';

export const TOPICS_VIEW_ID = 'arxivjs.topics';

/**
 * 트리 상태. package.json의 viewsWelcome이 컨텍스트 키 `arxivjs.state`로 안내 문구를 고른다.
 * - noFolder: 데이터 폴더 설정이 비었다
 * - invalidFolder: 경로가 절대 경로가 아니거나, 없거나, 폴더가 아니다
 * - empty: 폴더는 있지만 주제 폴더가 없다
 * - ready: 주제를 표시 중이다
 */
export type TreeState = 'noFolder' | 'invalidFolder' | 'empty' | 'ready';

export interface TopicNode {
  kind: 'topic';
  topic: Topic;
}
export interface PaperNode {
  kind: 'paper';
  paper: Paper;
  parent: TopicNode;
}
export interface MessageNode {
  kind: 'message';
  text: string;
  isError: boolean;
  parent: TopicNode;
}
export type TreeNode = TopicNode | PaperNode | MessageNode;

export const TOPIC_CONTEXT = 'arxivjs.topic';
export const PAPER_CONTEXT = 'arxivjs.paper';
export const OPEN_PAPER_COMMAND = 'arxivjs.openPaper';
export const OPEN_TOPIC_COMMAND = 'arxivjs.openTopic';

export class TopicTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private readonly topicNodes = new Map<string, TopicNode>();
  /** 주제별 논문 수 (펼친 뒤에만 안다) */
  private readonly paperCounts = new Map<string, number>();
  private _state: TreeState | undefined;

  constructor(
    private readonly getLibrary: () => Library | undefined,
    private readonly isFolderConfigured: () => boolean,
    private readonly log: Logger,
  ) {}

  get state(): TreeState | undefined {
    return this._state;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  /** 트리 전체를 다시 그린다. 캐시는 건드리지 않는다(정렬 변경 등). */
  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  /** 데이터 폴더 전체를 다시 읽는다. */
  reloadAll(): void {
    this.getLibrary()?.reloadAll();
    this.topicNodes.clear();
    this.paperCounts.clear();
    this.refresh();
  }

  /** 주제 하나의 논문 목록을 다시 읽는다. */
  reloadTopic(topicId: string): void {
    this.getLibrary()?.papers.reloadTopic(topicId);
    this.paperCounts.delete(topicId);
    this.changeEmitter.fire(this.topicNodes.get(topicId));
  }

  /** 캐시는 그대로 두고 주제 하나를 다시 그린다 (논문 하나를 reload한 뒤). */
  refreshTopic(topicId: string): void {
    const node = this.topicNodes.get(topicId);
    if (node) {
      this.changeEmitter.fire(node);
    }
  }

  getTopicNode(topicId: string): TopicNode | undefined {
    return this.topicNodes.get(topicId);
  }

  getParent(node: TreeNode): TreeNode | undefined {
    return node.kind === 'topic' ? undefined : node.parent;
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      return this.rootChildren();
    }
    return node.kind === 'topic' ? this.topicChildren(node) : [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'topic':
        return this.topicItem(node);
      case 'paper':
        return this.paperItem(node);
      case 'message': {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(node.isError ? 'error' : 'info');
        return item;
      }
    }
  }

  /** 툴팁은 마우스를 올렸을 때 만든다. */
  resolveTreeItem(item: vscode.TreeItem, node: TreeNode): vscode.TreeItem {
    if (node.kind === 'paper') {
      item.tooltip = paperTooltip(node.paper);
    }
    return item;
  }

  private async rootChildren(): Promise<TreeNode[]> {
    const library = this.getLibrary();
    if (!library) {
      this.setState(this.isFolderConfigured() ? 'invalidFolder' : 'noFolder');
      return [];
    }
    try {
      const topics = await library.topics.list();
      this.setState(topics.length > 0 ? 'ready' : 'empty');
      return topics.map((topic) => this.topicNode(topic));
    } catch (err) {
      this.log.error(`데이터 폴더를 읽지 못함: ${library.root} — ${errorText(err)}`);
      this.setState('invalidFolder');
      return [];
    }
  }

  private async topicChildren(node: TopicNode): Promise<TreeNode[]> {
    const library = this.getLibrary();
    if (!library) {
      return [];
    }
    try {
      const papers = await library.papers.list(node.topic);
      this.setPaperCount(node, papers.length);
      return papers.map((paper) => ({ kind: 'paper', paper, parent: node }));
    } catch (err) {
      this.log.error(`주제를 읽지 못함: ${node.topic.id} — ${errorText(err)}`);
      const text = isNotFound(err) ? '주제 폴더를 찾을 수 없습니다. Reload 하세요.' : '논문 목록을 읽지 못했습니다. 출력 채널 ArxivJS를 확인하세요.';
      return [{ kind: 'message', text, isError: true, parent: node }];
    }
  }

  private topicNode(topic: Topic): TopicNode {
    const existing = this.topicNodes.get(topic.id);
    if (existing && existing.topic.path === topic.path) {
      return existing;
    }
    const node: TopicNode = { kind: 'topic', topic };
    this.topicNodes.set(topic.id, node);
    return node;
  }

  /** 논문 수를 처음 알게 되면 주제 노드를 다시 그려 "(N)"을 표시한다. */
  private setPaperCount(node: TopicNode, count: number): void {
    if (this.paperCounts.get(node.topic.id) !== count) {
      this.paperCounts.set(node.topic.id, count);
      this.changeEmitter.fire(node);
    }
  }

  private topicItem(node: TopicNode): vscode.TreeItem {
    const { topic } = node;
    const item = new vscode.TreeItem(topic.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = `topic:${topic.id}`;
    item.description = topicDescription(this.paperCounts.get(topic.id));
    item.tooltip = `${topic.id}\n${topic.path}`;
    item.iconPath = new vscode.ThemeIcon('library');
    item.contextValue = TOPIC_CONTEXT;
    item.command = { command: OPEN_TOPIC_COMMAND, title: '주제 열기', arguments: [node] };
    return item;
  }

  private paperItem(node: PaperNode): vscode.TreeItem {
    const { paper } = node;
    const item = new vscode.TreeItem(paper.meta.title, vscode.TreeItemCollapsibleState.None);
    item.id = `paper:${paper.id}`;
    item.description = paperDescription(paper);
    item.iconPath = new vscode.ThemeIcon(paper.metaError ? 'warning' : paper.mdPath ? 'markdown' : 'file');
    item.contextValue = paper.mdPath ? PAPER_CONTEXT : `${PAPER_CONTEXT}.noMarkdown`;
    item.command = { command: OPEN_PAPER_COMMAND, title: '논문 열기', arguments: [node] };
    return item;
  }

  private setState(state: TreeState): void {
    if (this._state !== state) {
      this._state = state;
      void vscode.commands.executeCommand('setContext', 'arxivjs.state', state);
    }
  }
}

/** 논문 툴팁. 제목·초록 등 데이터는 appendText로 이스케이프해서 마크다운으로 해석되지 않게 한다. */
function paperTooltip(paper: Paper): vscode.MarkdownString {
  const { title, lines, abstract } = paperTooltipLines(paper);
  const md = new vscode.MarkdownString();
  md.appendMarkdown('**').appendText(title).appendMarkdown('**\n\n');
  for (const line of lines) {
    if (line.label) {
      md.appendMarkdown(`*${line.label}*: `);
    }
    md.appendText(line.text).appendMarkdown('  \n');
  }
  if (abstract) {
    md.appendMarkdown('\n---\n\n').appendText(abstract);
  }
  return md;
}

function errorText(err: unknown): string {
  if (err instanceof DataError) {
    return `${err.kind}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
