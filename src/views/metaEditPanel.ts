import * as vscode from 'vscode';
import type { MetaFormErrors, MetaFormValues } from '../data/metaForm';
import { createNonce } from '../render/html';
import { buildMetaFormHtml } from '../render/metaFormHtml';
import type { Logger } from '../util/logger';
import { activeColumn, tabIcon } from './paperPanel';

export const META_EDIT_PANEL_TYPE = 'arxivjs.metaEdit';

/** 저장 결과. 실패하면 필드별 오류나 전체 메시지를 폼에 보여 준다. */
export interface MetaSaveFailure {
  errors?: MetaFormErrors;
  message?: string;
}

export interface MetaEditRequest {
  heading: string;
  subheading?: string;
  mode: 'add' | 'edit';
  initial: MetaFormValues;
  /** 저장한다. 성공하면 undefined를 돌려주고 패널이 닫힌다. */
  save(values: MetaFormValues): Promise<MetaSaveFailure | undefined>;
}

interface FormMessage {
  type?: string;
  values?: Partial<MetaFormValues>;
}

const FIELDS: (keyof MetaFormValues)[] = ['title', 'authors', 'year', 'url', 'abstract', 'citation', 'source', 'paperId'];

/** 메타 정보 입력 폼 (DEV-PLAN §3.2.2): 직접 입력으로 논문 추가, 메타 정보 편집. 패널은 하나다. */
export class MetaEditPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private request: MetaEditRequest | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly log: Logger,
  ) {}

  /** 마지막으로 그린 HTML (테스트용) */
  get html(): string | undefined {
    return this.panel?.webview.html;
  }

  show(request: MetaEditRequest): void {
    this.request = request;
    if (this.panel) {
      this.panel.reveal(undefined, false);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        META_EDIT_PANEL_TYPE,
        request.heading,
        { viewColumn: activeColumn(), preserveFocus: false },
        { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] },
      );
      this.panel.iconPath = tabIcon(this.extensionUri, 'paper');
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.request = undefined;
      });
      this.panel.webview.onDidReceiveMessage((msg: FormMessage) => this.handleMessage(msg));
    }
    const webview = this.panel.webview;
    const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    this.panel.title = request.heading;
    webview.html = buildMetaFormHtml(
      { heading: request.heading, subheading: request.subheading, mode: request.mode, values: request.initial },
      {
        cspSource: webview.cspSource,
        nonce: createNonce(),
        styleUris: [uri('media', 'common.css'), uri('media', 'metaForm.css')],
        scriptUris: [uri('media', 'metaForm.js')],
      },
    );
  }

  closeAll(): void {
    this.panel?.dispose();
  }

  dispose(): void {
    this.closeAll();
  }

  /** webview 메시지 처리 (통합 테스트에서도 직접 부른다) */
  async handleMessage(msg: FormMessage): Promise<void> {
    const request = this.request;
    if (!request) {
      return;
    }
    if (msg.type === 'cancel') {
      this.closeAll();
      return;
    }
    if (msg.type !== 'submit') {
      return;
    }
    const raw = msg.values ?? {};
    const values = Object.fromEntries(FIELDS.map((k) => [k, typeof raw[k] === 'string' ? raw[k] : ''])) as unknown as MetaFormValues;
    let failure: MetaSaveFailure | undefined;
    try {
      failure = await request.save(values);
    } catch (err) {
      this.log.error(`메타 정보 저장 실패: ${String(err)}`);
      failure = { message: '저장하지 못했습니다. 출력 채널 ArxivJS를 확인하세요.' };
    }
    if (this.request !== request) {
      return; // 그사이 다른 폼을 열었다.
    }
    if (failure) {
      await this.panel?.webview.postMessage({ type: 'result', errors: failure.errors ?? {}, message: failure.message ?? '' });
    } else {
      this.closeAll();
    }
  }
}
