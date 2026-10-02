import * as vscode from 'vscode';
import { isNotFound } from '../data/errors';
import type { Library } from '../data/library';
import type { Paper, PaperSort, Topic } from '../data/models';
import { createNonce, type Notice } from '../render/html';
import { PaperRenderer } from '../render/markdown';
import { buildTopicHtml, toTopicRow } from '../render/topicHtml';
import type { Logger } from '../util/logger';
import { openExternalUrl } from './paperPanel';

export const TOPIC_PANEL_TYPE = 'arxivjs.topic';

export interface TopicPanelHost {
  getLibrary(): Library | undefined;
  defaultSort(): PaperSort;
  openPaper(topic: Topic, paper: Paper): void;
  /** 이 주제의 캐시를 비우고 트리도 다시 그린다. 이후 패널이 다시 읽는다. */
  reloadTopic(topicId: string): void;
}

export interface TopicMessage {
  type?: string;
  id?: string;
}

/** Topic 패널 (DEV-PLAN §3.2): 주제의 논문 표. 패널은 하나만 두고 주제를 바꿔 가며 쓴다. */
export class TopicPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private topic: Topic | undefined;
  private papers = new Map<string, Paper>();
  private renderSeq = 0;
  private readonly renderer = new PaperRenderer();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: TopicPanelHost,
    private readonly log: Logger,
  ) {}

  /** 열린 주제 id (테스트용) */
  get currentTopicId(): string | undefined {
    return this.topic?.id;
  }

  /** 마지막으로 그린 HTML (테스트용) */
  get html(): string | undefined {
    return this.panel?.webview.html;
  }

  async show(topic: Topic): Promise<void> {
    this.topic = topic;
    if (this.panel) {
      this.panel.reveal(undefined, false);
    } else {
      this.panel = this.createPanel();
    }
    await this.render();
  }

  /**
   * 데이터가 다시 읽혔을 때 패널을 다시 그린다.
   * topicId를 주면 그 주제를 보고 있을 때만, 없으면 항상 다시 그린다.
   */
  async refresh(topicId?: string): Promise<void> {
    if (this.panel && this.topic && (topicId === undefined || topicId === this.topic.id)) {
      await this.render();
    }
  }

  closeAll(): void {
    this.panel?.dispose();
  }

  dispose(): void {
    this.closeAll();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      TOPIC_PANEL_TYPE,
      this.topic?.label ?? 'Topic',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        enableFindWidget: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media'), vscode.Uri.joinPath(this.extensionUri, 'dist', 'katex')],
      },
    );
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.topic = undefined;
      this.papers.clear();
    });
    panel.webview.onDidReceiveMessage((msg: TopicMessage) => this.handleMessage(msg));
    return panel;
  }

  /** webview 메시지 처리 (통합 테스트에서도 직접 부른다) */
  async handleMessage(msg: TopicMessage): Promise<void> {
    const topic = this.topic;
    if (!topic) {
      return;
    }
    if (msg.type === 'reload') {
      this.log.info(`Reload: 주제 ${topic.id} (Topic 패널)`);
      this.host.reloadTopic(topic.id); // 캐시를 비우고 트리·패널을 다시 그리게 한다.
      return;
    }
    const paper = msg.id ? this.papers.get(msg.id) : undefined;
    if (!paper) {
      return;
    }
    switch (msg.type) {
      case 'openPaper':
        this.host.openPaper(topic, paper);
        return;
      case 'openExternal':
        if (paper.meta.url) {
          await openExternalUrl(paper.meta.url, this.log);
        }
        return;
      case 'abstract': {
        const html = paper.meta.abstract ? this.renderer.renderInline(paper.meta.abstract) : '';
        await this.panel?.webview.postMessage({ type: 'abstract', id: paper.id, html });
        return;
      }
    }
  }

  private async render(): Promise<void> {
    const panel = this.panel;
    const topic = this.topic;
    const library = this.host.getLibrary();
    if (!panel || !topic) {
      return;
    }
    const seq = ++this.renderSeq;
    const notices: Notice[] = [];
    let papers: Paper[] = [];
    if (library) {
      try {
        papers = await library.papers.list(topic);
      } catch (err) {
        this.log.error(`주제를 읽지 못함: ${topic.id} — ${String(err)}`);
        notices.push({
          kind: 'error',
          text: isNotFound(err) ? '주제 폴더를 찾을 수 없습니다. Reload 하세요.' : '논문 목록을 읽지 못했습니다. 출력 채널 ArxivJS를 확인하세요.',
        });
      }
    }
    if (seq !== this.renderSeq || this.panel !== panel || this.topic !== topic) {
      return; // 더 최근 렌더링이 시작됐거나 패널이 닫혔다.
    }
    this.papers = new Map(papers.map((p) => [p.id, p]));
    const webview = panel.webview;
    const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    panel.title = topic.label;
    webview.html = buildTopicHtml(
      { topicId: topic.id, topicLabel: topic.label, rows: papers.map(toTopicRow), defaultSort: this.host.defaultSort(), notices },
      {
        cspSource: webview.cspSource,
        nonce: createNonce(),
        styleUris: [uri('dist', 'katex', 'katex.min.css'), uri('media', 'common.css'), uri('media', 'topic.css')],
        scriptUris: [uri('media', 'topicModel.js'), uri('media', 'topic.js')],
      },
    );
  }
}
