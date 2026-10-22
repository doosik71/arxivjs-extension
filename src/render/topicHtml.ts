// Topic 패널 HTML 템플릿 (vscode 비의존). 표는 webview 스크립트가 JSON 데이터로 그린다.
import type { Paper, PaperSort } from '../data/models';
import { currentLanguage, fmt, t } from '../i18n';
import { countAuthors } from '../views/format';
import { contentSecurityPolicy, escapeHtml, scriptTags, type Notice, type WebviewResources } from './html';

/** webview로 보내는 논문 한 줄. 문자열은 스크립트가 textContent로 넣으므로 여기서 이스케이프하지 않는다. */
export interface TopicRow {
  id: string;
  title: string;
  authors: string;
  /** 저자 수 (저자 줄이 잘렸을 때 표시) */
  authorCount: number;
  year?: number;
  citation?: number;
  source?: string;
  hasUrl: boolean;
  hasMarkdown: boolean;
  hasAbstract: boolean;
  metaError: boolean;
}

export interface TopicViewModel {
  topicId: string;
  topicLabel: string;
  rows: TopicRow[];
  defaultSort: PaperSort;
  notices: Notice[];
  /** 쓰기 버튼(논문 추가)을 보인다 */
  canWrite?: boolean;
}

export function toTopicRow(paper: Paper): TopicRow {
  const { meta } = paper;
  return {
    id: paper.id,
    title: meta.title,
    authors: meta.authors,
    authorCount: countAuthors(meta.authors),
    year: meta.year,
    citation: meta.citation,
    source: meta.source,
    hasUrl: Boolean(meta.url),
    hasMarkdown: Boolean(paper.mdPath),
    hasAbstract: Boolean(meta.abstract),
    metaError: Boolean(paper.metaError),
  };
}

/**
 * <script type="application/json"> 안에 넣을 JSON.
 * `<`를 JSON 유니코드 이스케이프로 바꿔 데이터 속의 "</script>"가 태그를 닫지 못하게 한다.
 * U+2028/2029(줄 구분 문자)도 이스케이프해 둔다.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildTopicHtml(vm: TopicViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const notices = vm.notices.map((n) => `<div class="notice notice-${n.kind}" role="status">${escapeHtml(n.text)}</div>`).join('');
  const m = t().topic;
  const data = { topicId: vm.topicId, defaultSort: vm.defaultSort, rows: vm.rows, strings: m.script };

  return `<!DOCTYPE html>
<html lang="${currentLanguage()}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(res.cspSource, res.nonce)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styles}
  <title>${escapeHtml(vm.topicLabel)}</title>
</head>
<body data-topic-id="${escapeHtml(vm.topicId)}">
  <header class="topic-header">
    <div class="toolbar">
      <h1 class="topic-title">${escapeHtml(vm.topicLabel)}</h1>
      <span class="count" id="count" aria-live="polite">${escapeHtml(fmt(m.script.count, { n: vm.rows.length }))}</span>
      <span class="spacer"></span>
      ${vm.canWrite ? `<button type="button" data-action="addPaper" title="${escapeHtml(m.addPaperTitle)}">${escapeHtml(m.addPaper)}</button>` : ''}
      <button type="button" data-action="reload" title="${escapeHtml(m.reloadTitle)}">⟳ Reload</button>
    </div>
    <div class="toolbar filters">
      <input type="search" id="filter" placeholder="${escapeHtml(m.filterPlaceholder)}" aria-label="${escapeHtml(m.filterLabel)}" autocomplete="off">
      <label class="check"><input type="checkbox" id="onlyMarkdown"> ${escapeHtml(m.onlyMarkdown)}</label>
    </div>
  </header>
  ${notices}
  <table class="papers" aria-label="${escapeHtml(m.tableLabel(vm.topicLabel))}">
    <thead>
      <tr>
        <th class="col-title"><button type="button" class="sort" data-sort="title">${escapeHtml(m.colTitle)}</button></th>
        <th class="col-year"><button type="button" class="sort" data-sort="year">${escapeHtml(m.colYear)}</button></th>
        <th class="col-citation"><button type="button" class="sort" data-sort="citation">${escapeHtml(m.colCitation)}</button></th>
        <th class="col-actions"><span class="visually-hidden">${escapeHtml(m.colActions)}</span></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <p class="empty" id="empty" hidden>${escapeHtml(m.empty)}</p>
  <script id="topic-data" type="application/json">${jsonForScript(data)}</script>
  ${scriptTags(res)}
</body>
</html>`;
}
