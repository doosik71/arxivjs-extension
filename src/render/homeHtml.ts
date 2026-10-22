// 홈(주제 목록) 페이지 HTML 템플릿 (vscode 비의존). 목록은 webview 스크립트가 JSON 데이터로 그린다.
import { currentLanguage, fmt, t } from '../i18n';
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
  /** 쓰기 버튼(주제 추가)을 보인다 */
  canWrite?: boolean;
}

/**
 * 요약 줄. 논문 수는 첫 화면 뒤에 비동기로 채워지므로, 다 세기 전에는 "세는 중"을 붙인다.
 * home.js에도 같은 규칙이 있다 (개수가 도착할 때마다 다시 쓴다).
 */
export function homeSummary(rows: readonly HomeRow[], done: boolean): string {
  const s = t().home.script;
  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  if (rows.length === 0) {
    return s.summaryZero;
  }
  return fmt(done ? s.summaryDone : s.summaryCounting, { topics: rows.length, papers: total.toLocaleString('en-US') });
}

export function buildHomeHtml(vm: HomeViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const notices = vm.notices.map((n) => `<div class="notice notice-${n.kind}" role="status">${escapeHtml(n.text)}</div>`).join('');
  const summary = vm.folder ? homeSummary(vm.rows, vm.rows.every((r) => r.count !== undefined)) : '';
  const m = t().home;
  const data = { folder: vm.folder ?? '', rows: vm.rows, strings: m.script };

  return `<!DOCTYPE html>
<html lang="${currentLanguage()}">
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
      <h1 class="home-title">${escapeHtml(m.title)}</h1>
      <span class="count" id="summary">${escapeHtml(summary)}</span>
      <span class="spacer"></span>
      ${vm.canWrite ? `<button type="button" data-action="createTopic" title="${escapeHtml(m.addTopicTitle)}">${escapeHtml(m.addTopic)}</button>` : ''}
      <button type="button" data-action="selectDataFolder" title="${escapeHtml(m.selectFolderTitle)}">${escapeHtml(m.selectFolder)}</button>
      <button type="button" data-action="reload" title="${escapeHtml(m.reloadTitle)}">⟳ Reload</button>
    </div>
    ${vm.folder ? `<p class="folder" title="${escapeHtml(m.folderTitle)}">${escapeHtml(vm.folder)}</p>` : ''}
    <div class="toolbar filters">
      <input type="search" id="filter" placeholder="${escapeHtml(m.filterPlaceholder)}" aria-label="${escapeHtml(m.filterLabel)}" autocomplete="off">
      <span class="sort-group" role="group" aria-label="${escapeHtml(m.sortLabel)}">
        <button type="button" class="sort" data-sort="name">${escapeHtml(m.sortName)}</button>
        <button type="button" class="sort" data-sort="count">${escapeHtml(m.sortCount)}</button>
      </span>
      <span class="count" id="visible" aria-live="polite"></span>
    </div>
  </header>
  ${notices}
  <ul class="topics" id="topics" aria-label="${escapeHtml(m.listLabel)}"></ul>
  <p class="empty" id="empty" hidden>${escapeHtml(m.empty)}</p>
  <script id="home-data" type="application/json">${jsonForScript(data)}</script>
  ${scriptTags(res)}
</body>
</html>`;
}
