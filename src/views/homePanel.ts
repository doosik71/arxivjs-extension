import * as vscode from 'vscode';
import type { Library } from '../data/library';
import type { Topic } from '../data/models';
import { buildHomeHtml } from '../render/homeHtml';
import { createNonce, type Notice } from '../render/html';
import type { Logger } from '../util/logger';
import { mapLimit } from '../util/mapLimit';

export const HOME_PANEL_TYPE = 'arxivjs.home';

/** 논문 수를 webview로 보내는 간격 (이 사이에 센 주제를 묶어서 보낸다) */
const COUNT_FLUSH_MS = 50;

export interface HomePanelHost {
  getLibrary(): Library | undefined;
  /** 설정에 적힌 데이터 폴더 값 (비었으면 '') */
  configuredFolder(): string;
  openTopic(topic: Topic): void;
  selectDataFolder(): void;
  reloadAll(): void;
}

export interface HomeMessage {
  type?: string;
  id?: string;
}

/**
 * 홈(주제 목록) 페이지: 모든 주제와 논문 수를 보여주고 필터로 빠르게 찾게 한다. 패널은 하나다.
 *
 * 첫 화면은 주제 목록만으로 바로 그린다. 주제별 논문 수는 그 뒤에 비동기로 세어
 * 몇 개씩 묶어 webview로 보낸다 (주제 수백 개, 논문 수천 편이어도 첫 화면을 기다리지 않게).
 */
export class HomePanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private topics = new Map<string, Topic>();
  private renderSeq = 0;
  /** 지금 화면(renderSeq)에 대해 센 논문 수. 세지 못한 주제는 null */
  private counts = new Map<string, number | null>();
  private countsDone = false;
  private countsReady: Promise<void> = Promise.resolve();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: HomePanelHost,
    private readonly log: Logger,
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  /** 마지막으로 그린 HTML (테스트용) */
  get html(): string | undefined {
    return this.panel?.webview.html;
  }

  /** 지금까지 센 논문 수 (테스트용) */
  get paperCounts(): ReadonlyMap<string, number | null> {
    return this.counts;
  }

  /** 논문 수를 모두 셀 때까지 기다린다 (테스트용) */
  whenCountsReady(): Promise<void> {
    return this.countsReady;
  }

  async show(options: { preserveFocus?: boolean } = {}): Promise<void> {
    if (this.panel) {
      this.panel.reveal(undefined, options.preserveFocus ?? false);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        HOME_PANEL_TYPE,
        'ArxivJS',
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: options.preserveFocus ?? false },
        { enableScripts: true, enableFindWidget: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.topics.clear();
        this.counts.clear();
        this.renderSeq++; // 진행 중인 개수 세기를 멈춘다.
      });
      this.panel.webview.onDidReceiveMessage((msg: HomeMessage) => this.handleMessage(msg));
    }
    await this.render();
  }

  /** 열려 있으면 다시 그린다 (Reload, 데이터 폴더 변경 후). */
  async refresh(): Promise<void> {
    if (this.panel) {
      await this.render();
    }
  }

  closeAll(): void {
    this.panel?.dispose();
  }

  dispose(): void {
    this.closeAll();
  }

  /** webview 메시지 처리 (통합 테스트에서도 직접 부른다) */
  async handleMessage(msg: HomeMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        // webview가 준비되기 전에 보낸 메시지는 사라질 수 있으므로, 지금까지 센 수를 한 번에 다시 보낸다.
        await this.postCounts(this.counts, this.countsDone);
        return;
      case 'openTopic': {
        const topic = msg.id ? this.topics.get(msg.id) : undefined;
        if (topic) {
          this.host.openTopic(topic);
        }
        return;
      }
      case 'reload':
        this.host.reloadAll();
        return;
      case 'selectDataFolder':
        this.host.selectDataFolder();
        return;
    }
  }

  private async render(): Promise<void> {
    const panel = this.panel;
    if (!panel) {
      return;
    }
    const seq = ++this.renderSeq;
    const library = this.host.getLibrary();
    const notices: Notice[] = [];
    let topics: Topic[] = [];

    if (!library) {
      notices.push(
        this.host.configuredFolder()
          ? { kind: 'error', text: '데이터 폴더 설정이 절대 경로가 아닙니다. "폴더 선택"으로 다시 지정하세요.' }
          : { kind: 'info', text: '데이터 폴더가 설정되지 않았습니다. "폴더 선택"으로 arxivjs 데이터 폴더를 지정하세요.' },
      );
    } else {
      try {
        topics = await library.topics.list(); // 폴더 목록 한 번만 읽는다.
        if (topics.length === 0) {
          notices.push({ kind: 'info', text: '데이터 폴더에 주제 폴더가 없습니다. 주제 폴더 이름은 영문자, 숫자, _, - 만 쓸 수 있습니다.' });
        }
      } catch (err) {
        this.log.error(`데이터 폴더를 읽지 못함: ${library.root} — ${String(err)}`);
        notices.push({ kind: 'error', text: '데이터 폴더를 열 수 없습니다. 경로가 존재하는 폴더인지 확인하세요.' });
      }
    }

    if (seq !== this.renderSeq || this.panel !== panel) {
      return;
    }
    this.topics = new Map(topics.map((t) => [t.id, t]));
    this.counts = new Map();
    this.countsDone = topics.length === 0;
    const webview = panel.webview;
    const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    webview.html = buildHomeHtml(
      { folder: library?.root, rows: topics.map((t) => ({ id: t.id, label: t.label })), notices },
      {
        cspSource: webview.cspSource,
        nonce: createNonce(),
        styleUris: [uri('media', 'common.css'), uri('media', 'home.css')],
        scriptUris: [uri('media', 'topicModel.js'), uri('media', 'home.js')],
      },
    );
    if (library && topics.length > 0) {
      this.countsReady = this.countPapers(seq, library, topics);
    } else {
      this.countsReady = Promise.resolve();
    }
  }

  /** 주제별 논문 수를 세어 COUNT_FLUSH_MS마다 묶어서 보낸다. 더 새로운 화면이 그려지면 멈춘다. */
  private async countPapers(seq: number, library: Library, topics: Topic[]): Promise<void> {
    const started = Date.now();
    let pending = new Map<string, number | null>();
    let lastFlush = Date.now();
    const stale = () => seq !== this.renderSeq;

    await mapLimit(topics, 16, async (topic) => {
      if (stale()) {
        return;
      }
      let count: number | null;
      try {
        count = await library.papers.count(topic);
      } catch (err) {
        this.log.warn(`논문 수를 세지 못함: ${topic.id} — ${String(err)}`);
        count = null;
      }
      if (stale()) {
        return;
      }
      this.counts.set(topic.id, count);
      pending.set(topic.id, count);
      if (Date.now() - lastFlush >= COUNT_FLUSH_MS) {
        const batch = pending;
        pending = new Map();
        lastFlush = Date.now();
        await this.postCounts(batch, false);
      }
    });
    if (stale()) {
      return;
    }
    this.countsDone = true;
    await this.postCounts(pending, true);
    this.log.info(`홈: 주제 ${topics.length}개의 논문 수를 셌다 (${Date.now() - started}ms)`);
  }

  private async postCounts(counts: ReadonlyMap<string, number | null>, done: boolean): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'counts', counts: Object.fromEntries(counts), done });
  }
}
