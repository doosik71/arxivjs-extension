// Topic 패널 HTML 템플릿 (vscode 비의존). 표는 webview 스크립트가 JSON 데이터로 그린다.
import type { Paper, PaperSort } from '../data/models';
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
  const data = { topicId: vm.topicId, defaultSort: vm.defaultSort, rows: vm.rows };

  return `<!DOCTYPE html>
<html lang="ko">
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
      <span class="count" id="count" aria-live="polite">${vm.rows.length}편</span>
      <span class="spacer"></span>
      <button type="button" data-action="reload" title="이 주제의 논문 목록을 다시 읽기">⟳ Reload</button>
    </div>
    <div class="toolbar filters">
      <input type="search" id="filter" placeholder="제목, 저자로 필터" aria-label="논문 필터" autocomplete="off">
      <label class="check"><input type="checkbox" id="onlyMarkdown"> 요약 문서 있는 것만</label>
    </div>
  </header>
  ${notices}
  <table class="papers" aria-label="${escapeHtml(vm.topicLabel)} 논문 목록">
    <thead>
      <tr>
        <th class="col-title"><button type="button" class="sort" data-sort="title">제목</button></th>
        <th class="col-year"><button type="button" class="sort" data-sort="year">연도</button></th>
        <th class="col-citation"><button type="button" class="sort" data-sort="citation">인용</button></th>
        <th class="col-actions"><span class="visually-hidden">동작</span></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <p class="empty" id="empty" hidden>조건에 맞는 논문이 없습니다.</p>
  <script id="topic-data" type="application/json">${jsonForScript(data)}</script>
  ${scriptTags(res)}
</body>
</html>`;
}
