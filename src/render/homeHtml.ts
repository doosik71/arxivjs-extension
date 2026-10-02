// 홈(주제 목록) 페이지 HTML 템플릿 (vscode 비의존). 목록은 webview 스크립트가 JSON 데이터로 그린다.
import { contentSecurityPolicy, escapeHtml, scriptTags, type Notice, type WebviewResources } from './html';
import { jsonForScript } from './topicHtml';

export interface HomeRow {
  /** 폴더 이름 */
  id: string;
  /** 표시 이름 */
  label: string;
  /** 논문 수. 세지 못했으면 undefined */
  count?: number;
}

export interface HomeViewModel {
  /** 데이터 폴더 절대 경로. 설정되지 않았으면 undefined */
  folder?: string;
  rows: HomeRow[];
  notices: Notice[];
}

/**
 * 요약 줄. 논문 수는 첫 화면 뒤에 비동기로 채워지므로, 다 세기 전에는 "세는 중"을 붙인다.
 * home.js에도 같은 규칙이 있다 (개수가 도착할 때마다 다시 쓴다).
 */
export function homeSummary(rows: readonly HomeRow[], done: boolean): string {
  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  if (rows.length === 0) {
    return '주제 0개';
  }
  return done ? `주제 ${rows.length}개 · 논문 ${total.toLocaleString('en-US')}편` : `주제 ${rows.length}개 · 논문 수 세는 중…`;
}

export function buildHomeHtml(vm: HomeViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const notices = vm.notices.map((n) => `<div class="notice notice-${n.kind}" role="status">${escapeHtml(n.text)}</div>`).join('');
  const summary = vm.folder ? homeSummary(vm.rows, vm.rows.every((r) => r.count !== undefined)) : '';
  const data = { folder: vm.folder ?? '', rows: vm.rows };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(res.cspSource, res.nonce)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styles}
  <title>ArxivJS</title>
</head>
<body>
  <header class="home-header">
    <div class="toolbar">
      <h1 class="home-title">ArxivJS 주제 목록</h1>
      <span class="count" id="summary">${escapeHtml(summary)}</span>
      <span class="spacer"></span>
      <button type="button" data-action="selectDataFolder" title="데이터 폴더 선택">폴더 선택</button>
      <button type="button" data-action="reload" title="데이터 폴더를 다시 읽기">⟳ Reload</button>
    </div>
    ${vm.folder ? `<p class="folder" title="데이터 폴더">${escapeHtml(vm.folder)}</p>` : ''}
    <div class="toolbar filters">
      <input type="search" id="filter" placeholder="주제 이름으로 필터 (Enter: 첫 주제 열기)" aria-label="주제 필터" autocomplete="off">
      <span class="sort-group" role="group" aria-label="정렬">
        <button type="button" class="sort" data-sort="name">이름순</button>
        <button type="button" class="sort" data-sort="count">논문 수순</button>
      </span>
      <span class="count" id="visible" aria-live="polite"></span>
    </div>
  </header>
  ${notices}
  <ul class="topics" id="topics" aria-label="주제 목록"></ul>
  <p class="empty" id="empty" hidden>조건에 맞는 주제가 없습니다.</p>
  <script id="home-data" type="application/json">${jsonForScript(data)}</script>
  ${scriptTags(res)}
</body>
</html>`;
}
