import * as vscode from 'vscode';
import { isNotFound } from '../data/errors';
import type { Library } from '../data/library';
import type { Paper, Topic } from '../data/models';
import { buildPaperHtml, createNonce, type Notice } from '../render/html';
import { PaperRenderer } from '../render/markdown';
import type { Logger } from '../util/logger';
import { citationText, ellipsize } from './format';

export const PAPER_PANEL_TYPE = 'arxivjs.paper';
const PREVIEW_KEY = '__preview__';
const TITLE_CHARS = 40;
const EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto']);

interface PanelEntry {
  key: string;
  panel: vscode.WebviewPanel;
  topic: Topic;
  paper: Paper;
  /** 늦게 끝난 이전 렌더링이 최신 화면을 덮어쓰지 않게 한다. */
  renderSeq: number;
}

export interface PaperPanelHost {
  getLibrary(): Library | undefined;
  openInNewTab(): boolean;
  revealTopic(topicId: string): void;
  /** 논문을 다시 읽은 뒤 트리의 해당 주제를 다시 그린다. */
  onPaperReloaded(topicId: string): void;
}

/** Paper 패널 (DEV-PLAN §3.2, §6.4). 기본은 패널 하나를 재사용하고, openInNewTab이면 논문마다 연다. */
export class PaperPanelManager implements vscode.Disposable {
  private readonly entries = new Map<string, PanelEntry>();
  private readonly renderer = new PaperRenderer();
  private activeEntry: PanelEntry | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: PaperPanelHost,
    private readonly log: Logger,
  ) {}

  /** 현재 포커스된 Paper 패널의 논문 */
  get activePaper(): { topic: Topic; paper: Paper } | undefined {
    const e = this.activeEntry;
    return e?.panel.active ? { topic: e.topic, paper: e.paper } : undefined;
  }

  /** 열린 패널의 논문 id (테스트용) */
  get openPaperIds(): string[] {
    return [...this.entries.values()].map((e) => e.paper.id);
  }

  /** 마지막으로 그린 HTML (테스트용) */
  htmlOf(paperId: string): string | undefined {
    return [...this.entries.values()].find((e) => e.paper.id === paperId)?.panel.webview.html;
  }

  async show(topic: Topic, paper: Paper): Promise<void> {
    const key = this.host.openInNewTab() ? paper.id : PREVIEW_KEY;
    let entry = this.entries.get(key);
    if (entry) {
      entry.topic = topic;
      entry.paper = paper;
      entry.panel.reveal(undefined, false);
    } else {
      entry = this.createEntry(key, topic, paper);
    }
    await this.render(entry);
  }

  /** 패널의 논문을 디스크에서 다시 읽는다. */
  async reload(entry: PanelEntry | undefined = this.activeEntry): Promise<void> {
    const library = this.host.getLibrary();
    if (!entry || !library) {
      return;
    }
    this.log.info(`Reload: 논문 ${entry.paper.id}`);
    try {
      const fresh = await library.papers.reloadPaper(entry.topic, entry.paper.stem);
      this.host.onPaperReloaded(entry.topic.id);
      if (!fresh) {
        await this.render(entry, [{ kind: 'error', text: '이 논문의 파일(.json, .md)이 데이터 폴더에서 사라졌습니다.' }]);
        return;
      }
      entry.paper = fresh;
    } catch (err) {
      this.log.error(`논문을 다시 읽지 못함: ${entry.paper.id} — ${String(err)}`);
    }
    await this.render(entry);
  }

  /** 모든 패널을 닫는다 (데이터 폴더가 바뀌었을 때). */
  closeAll(): void {
    for (const e of [...this.entries.values()]) {
      e.panel.dispose();
    }
  }

  dispose(): void {
    this.closeAll();
  }

  private createEntry(key: string, topic: Topic, paper: Paper): PanelEntry {
    const panel = vscode.window.createWebviewPanel(
      PAPER_PANEL_TYPE,
      ellipsize(paper.meta.title, TITLE_CHARS),
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        enableFindWidget: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media'), vscode.Uri.joinPath(this.extensionUri, 'dist', 'katex')],
      },
    );
    const entry: PanelEntry = { key, panel, topic, paper, renderSeq: 0 };
    this.entries.set(key, entry);
    this.activeEntry = entry;

    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this.activeEntry = entry;
      }
    });
    panel.onDidDispose(() => {
      this.entries.delete(key);
      if (this.activeEntry === entry) {
        this.activeEntry = undefined;
      }
    });
    panel.webview.onDidReceiveMessage((msg: { type?: string; href?: string }) => this.onMessage(entry, msg));
    return entry;
  }

  private async onMessage(entry: PanelEntry, msg: { type?: string; href?: string }): Promise<void> {
    switch (msg.type) {
      case 'reload':
        return this.reload(entry);
      case 'openExternal':
        if (entry.paper.meta.url) {
          await openExternalUrl(entry.paper.meta.url, this.log);
        }
        return;
      case 'copyInfo':
        await vscode.env.clipboard.writeText(citationText(entry.paper));
        void vscode.window.setStatusBarMessage('ArxivJS: 논문 정보를 복사했습니다.', 3000);
        return;
      case 'revealTopic':
        this.host.revealTopic(entry.topic.id);
        return;
      case 'openLink':
        if (typeof msg.href === 'string') {
          await openExternalUrl(msg.href, this.log);
        }
        return;
    }
  }

  private async render(entry: PanelEntry, extraNotices: Notice[] = []): Promise<void> {
    const seq = ++entry.renderSeq;
    const { paper, topic } = entry;
    const notices: Notice[] = [...extraNotices];
    if (paper.metaError) {
      notices.push({ kind: 'warning', text: `메타 정보(.json)를 읽지 못해 문서에서 추정한 값을 표시합니다: ${paper.metaError}` });
    }

    let bodyHtml: string | undefined;
    let headings: { level: number; text: string; id: string }[] = [];
    if (paper.mdPath) {
      try {
        const source = (await this.host.getLibrary()?.papers.readMarkdown(paper)) ?? '';
        const result = this.renderer.renderCached(paper.id, source);
        bodyHtml = result.html;
        headings = result.headings;
      } catch (err) {
        this.log.error(`문서를 읽지 못함: ${paper.mdPath} — ${String(err)}`);
        notices.push({
          kind: 'error',
          text: isNotFound(err) ? '요약 문서 파일이 없습니다. Reload 하세요.' : '요약 문서를 읽지 못했습니다. 출력 채널 ArxivJS를 확인하세요.',
        });
      }
    } else {
      notices.push({ kind: 'info', text: '요약 문서(.md)가 없습니다. 초록만 표시합니다.' });
    }

    if (seq !== entry.renderSeq || !this.entries.has(entry.key)) {
      return; // 더 최근 렌더링이 시작됐거나 패널이 닫혔다.
    }
    const webview = entry.panel.webview;
    const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    entry.panel.title = ellipsize(paper.meta.title, TITLE_CHARS);
    webview.html = buildPaperHtml(
      {
        id: paper.id,
        title: paper.meta.title,
        authors: paper.meta.authors,
        year: paper.meta.year,
        citation: paper.meta.citation,
        source: paper.meta.source,
        url: paper.meta.url,
        topicLabel: topic.label,
        abstractHtml: paper.meta.abstract ? this.renderer.renderInline(paper.meta.abstract) : undefined,
        bodyHtml,
        headings,
        notices,
      },
      {
        cspSource: webview.cspSource,
        nonce: createNonce(),
        styleUris: [uri('dist', 'katex', 'katex.min.css'), uri('media', 'paper.css')],
        scriptUri: uri('media', 'paper.js'),
      },
    );
  }
}

/** http, https, mailto 링크만 외부로 연다. 상대 경로나 다른 스킴은 무시한다. */
export async function openExternalUrl(href: string, log: Logger): Promise<boolean> {
  let uri: vscode.Uri;
  try {
    uri = vscode.Uri.parse(href, true);
  } catch {
    log.warn(`잘못된 링크: ${href}`);
    return false;
  }
  if (!EXTERNAL_SCHEMES.has(uri.scheme)) {
    log.warn(`외부로 열지 않는 링크: ${href}`);
    return false;
  }
  return vscode.env.openExternal(uri);
}
