// Paper 패널 HTML 템플릿 (vscode 비의존). 데이터 문자열은 모두 여기서 이스케이프한다.
import { randomBytes } from 'node:crypto';
import { formatCitation } from '../views/format';
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
  headings: Heading[];
  notices: Notice[];
}

export interface WebviewResources {
  /** webview.cspSource */
  cspSource: string;
  nonce: string;
  styleUris: string[];
  scriptUri: string;
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

function metaLine(vm: PaperViewModel): string {
  const parts: string[] = [];
  if (vm.year !== undefined) {
    parts.push(`<span class="year">${vm.year}</span>`);
  }
  if (vm.citation !== undefined) {
    parts.push(`<span class="citation">인용 ${formatCitation(vm.citation)}</span>`);
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
  return `<nav class="toc" aria-label="목차"><details open><summary>목차</summary><ol>${items}</ol></details></nav>`;
}

function notices(list: Notice[]): string {
  return list.map((n) => `<div class="notice notice-${n.kind}" role="status">${escapeHtml(n.text)}</div>`).join('');
}

export function buildPaperHtml(vm: PaperViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const openButton = vm.url
    ? `<button type="button" data-action="openExternal" title="${escapeHtml(vm.url)}">원문 열기</button>`
    : '';
  const abstract = vm.abstractHtml
    ? `<section class="abstract"><details${vm.bodyHtml ? '' : ' open'}><summary>초록 (Abstract)</summary><div class="abstract-body">${vm.abstractHtml}</div></details></section>`
    : '';
  const body = vm.bodyHtml ? `<article class="markdown-body">${vm.bodyHtml}</article>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
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
      <button type="button" class="link" data-action="revealTopic" title="트리에서 주제 보기">${escapeHtml(vm.topicLabel)}</button>
      <span class="spacer"></span>
      ${openButton}
      <button type="button" data-action="copyInfo" title="제목, 저자, 연도, URL 복사">정보 복사</button>
      <button type="button" data-action="reload" title="이 논문을 다시 읽기">⟳ Reload</button>
    </div>
    <h1 class="paper-title">${escapeHtml(vm.title)}</h1>
    ${vm.authors ? `<p class="authors">${escapeHtml(vm.authors)}</p>` : ''}
    <p class="meta">${metaLine(vm)}</p>
  </header>
  ${notices(vm.notices)}
  ${abstract}
  ${toc(vm.headings)}
  ${body}
  <script nonce="${res.nonce}" src="${escapeHtml(res.scriptUri)}"></script>
</body>
</html>`;
}
