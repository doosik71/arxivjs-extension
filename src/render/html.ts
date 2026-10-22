// Paper 패널 HTML 템플릿 (vscode 비의존). 데이터 문자열은 모두 여기서 이스케이프한다.
import { randomBytes } from 'node:crypto';
import { currentLanguage, t } from '../i18n';
import { countAuthors } from '../views/format';
import type { Heading } from './markdown';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

export interface Notice {
  kind: 'info' | 'warning' | 'error';
  text: string;
}

export interface PaperViewModel {
  /** Paper.id — webview가 Reload 후 스크롤 위치를 복원할 때 쓴다 */
  id: string;
  title: string;
  authors: string;
  year?: number;
  citation?: number;
  source?: string;
  url?: string;
  topicLabel: string;
  /** 렌더링된 초록 (renderInline 결과) */
  abstractHtml?: string;
  /** 렌더링된 본문 (render 결과). 없으면 문서 없음 */
  bodyHtml?: string;
  /** md 파일 경로. 있으면 "로컬 문서 열기" 버튼을 보여준다 (툴팁에 경로 표시) */
  localDocument?: string;
  headings: Heading[];
  notices: Notice[];
  /** 쓰기 버튼 (설정 arxivjs.enableWrite가 켜져 있을 때만) */
  writeActions?: { editMeta: boolean; deleteSummary: boolean; summarize?: 'create' | 'regenerate' };
}

export interface WebviewResources {
  /** webview.cspSource */
  cspSource: string;
  nonce: string;
  styleUris: string[];
  /** 순서대로 불러온다 */
  scriptUris: string[];
}

/**
 * CSP
 * - 스크립트: nonce가 붙은 확장 스크립트만
 * - 스타일: 확장 CSS + KaTeX가 만드는 style 속성 때문에 'unsafe-inline' (본문은 html:false라 사용자 HTML이 없다)
 * - 이미지: 확장 리소스, 원격 https, data: (DEV-PLAN §2.6, R5)
 */
export function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

/** nonce가 붙은 스크립트 태그 */
export function scriptTags(res: WebviewResources): string {
  return res.scriptUris.map((u) => `<script nonce="${res.nonce}" src="${escapeHtml(u)}"></script>`).join('\n  ');
}

/**
 * 저자 줄. CSS로 한 줄까지만 보이고 넘치면 "…"로 줄인다.
 * 넘칠 때만 스크립트(paper.js)가 "모두 보기 (N명)" 버튼을 보여주고, 누르면 펼치고 접는다.
 */
function authorsLine(authors: string): string {
  if (!authors) {
    return '';
  }
  const more = escapeHtml(t().paper.showAllAuthors(countAuthors(authors)));
  return (
    `<div class="authors" id="authors">` +
    `<span class="authors-text">${escapeHtml(authors)}</span>` +
    `<button type="button" class="link authors-toggle" data-toggle="authors" aria-controls="authors" aria-expanded="false" hidden ` +
    `data-more="${more}" data-less="${escapeHtml(t().paper.collapse)}">${more}</button>` +
    `</div>`
  );
}

function metaLine(vm: PaperViewModel): string {
  const parts: string[] = [];
  if (vm.year !== undefined) {
    parts.push(`<span class="year">${vm.year}</span>`);
  }
  if (vm.citation !== undefined) {
    parts.push(`<span class="citation">${escapeHtml(t().common.citedBy(vm.citation))}</span>`);
  }
  if (vm.source) {
    parts.push(`<span class="badge source-${escapeHtml(vm.source.toLowerCase())}">${escapeHtml(vm.source)}</span>`);
  }
  return parts.join('<span class="sep">·</span>');
}

function toc(headings: Heading[]): string {
  if (headings.length < 2) {
    return '';
  }
  const items = headings.map((h) => `<li><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`).join('');
  const label = escapeHtml(t().paper.toc);
  return `<nav class="toc" aria-label="${label}"><details open><summary>${label}</summary><ol>${items}</ol></details></nav>`;
}

function notices(list: Notice[]): string {
  return list.map((n) => `<div class="notice notice-${n.kind}" role="status">${escapeHtml(n.text)}</div>`).join('');
}

export function buildPaperHtml(vm: PaperViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const m = t().paper;
  const button = (action: string, title: string, text: string) =>
    `<button type="button" data-action="${action}" title="${escapeHtml(title)}">${escapeHtml(text)}</button>`;
  const openButton = vm.url ? button('openExternal', vm.url, m.openOriginal) : '';
  const localButton = vm.localDocument ? button('openLocal', vm.localDocument, m.openLocal) : '';
  const summarize = vm.writeActions?.summarize;
  const writeButtons = [
    summarize ? button('summarize', m.summarizeTitle, summarize === 'create' ? m.generateSummary : m.regenerateSummary) : '',
    vm.writeActions?.editMeta ? button('editMeta', m.editMetaTitle, m.editMeta) : '',
    vm.writeActions?.deleteSummary ? button('deleteSummary', m.deleteSummaryTitle, m.deleteSummary) : '',
  ].join('');
  const abstract = vm.abstractHtml
    ? `<section class="abstract"><details${vm.bodyHtml ? '' : ' open'}><summary>${escapeHtml(m.abstract)}</summary><div class="abstract-body">${vm.abstractHtml}</div></details></section>`
    : '';
  const body = vm.bodyHtml ? `<article class="markdown-body">${vm.bodyHtml}</article>` : '';

  return `<!DOCTYPE html>
<html lang="${currentLanguage()}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(res.cspSource, res.nonce)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styles}
  <title>${escapeHtml(vm.title)}</title>
</head>
<body data-paper-id="${escapeHtml(vm.id)}">
  <header class="paper-header">
    <div class="toolbar">
      <button type="button" class="link" data-action="revealTopic" title="${escapeHtml(m.revealTopicTitle)}">${escapeHtml(vm.topicLabel)}</button>
      <span class="spacer"></span>
      ${openButton}
      ${localButton}
      ${button('copyInfo', m.copyInfoTitle, m.copyInfo)}
      ${writeButtons}
      ${button('reload', m.reloadTitle, '⟳ Reload')}
    </div>
    <h1 class="paper-title">${escapeHtml(vm.title)}</h1>
    ${authorsLine(vm.authors)}
    <p class="meta">${metaLine(vm)}</p>
  </header>
  ${notices(vm.notices)}
  ${abstract}
  ${toc(vm.headings)}
  ${body}
  ${scriptTags(res)}
</body>
</html>`;
}
