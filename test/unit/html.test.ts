import { describe, expect, it } from 'vitest';
import { buildPaperHtml, contentSecurityPolicy, createNonce, escapeHtml, type PaperViewModel, type WebviewResources } from '../../src/render/html';

const res: WebviewResources = {
  cspSource: 'https://webview.test',
  nonce: 'NONCE123',
  styleUris: ['https://webview.test/katex.min.css', 'https://webview.test/paper.css'],
  scriptUris: ['https://webview.test/paper.js'],
};

const vm = (over: Partial<PaperViewModel> = {}): PaperViewModel => ({
  id: 'T/p',
  title: 'Before you <think>, monitor',
  authors: 'A & B',
  year: 2025,
  citation: 1234,
  source: 'pdf',
  url: 'https://arxiv.org/abs/1',
  topicLabel: 'Large Language Model',
  abstractHtml: '<span class="katex">x</span>',
  bodyHtml: '<h2 id="a">A</h2>',
  headings: [
    { level: 2, text: 'A', id: 'a' },
    { level: 2, text: 'B <i>', id: 'b' },
  ],
  notices: [],
  ...over,
});

describe('escapeHtml / createNonce', () => {
  it('HTML 특수 문자', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('nonce는 매번 다르다', () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
  });
});

describe('contentSecurityPolicy', () => {
  it('nonce 스크립트만, 원격 https 이미지 허용', () => {
    const csp = contentSecurityPolicy('https://webview.test', 'N');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-N'");
    expect(csp).toContain('img-src https://webview.test https: data:');
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
  });
});

describe('buildPaperHtml', () => {
  it('메타 헤더: 제목·저자는 이스케이프, 연도·인용수·source 배지·버튼', () => {
    const html = buildPaperHtml(vm(), res);
    expect(html).toContain('<h1 class="paper-title">Before you &lt;think&gt;, monitor</h1>');
    expect(html).toContain('<span class="authors-text">A &amp; B</span>');
    expect(html).toContain('인용 1,234');
    expect(html).toContain('class="badge source-pdf">pdf</span>');
    for (const action of ['openExternal', 'copyInfo', 'reload', 'revealTopic']) {
      expect(html).toContain(`data-action="${action}"`);
    }
    expect(html).toContain('data-paper-id="T/p"');
  });

  it('저자 줄: 이스케이프한 전체 저자, 처음에는 숨긴 "모두 보기 (N명)" 버튼', () => {
    const many = Array.from({ length: 1351 }, (_, i) => `Author <${i + 1}>`).join(', ');
    const html = buildPaperHtml(vm({ authors: many }), res);
    expect(html).toContain('<span class="authors-text">Author &lt;1&gt;, Author &lt;2&gt;');
    expect(html).toContain('Author &lt;1351&gt;</span>');
    expect(html).toMatch(/<button type="button" class="link authors-toggle" data-toggle="authors"[^>]* hidden [^>]*>모두 보기 \(1,351명\)<\/button>/);
    expect(html).toContain('data-less="접기"');
  });

  it('저자가 없으면 저자 줄이 없다', () => {
    expect(buildPaperHtml(vm({ authors: '' }), res)).not.toContain('class="authors"');
  });

  it('스크립트에 nonce, 스타일 링크', () => {
    const html = buildPaperHtml(vm(), res);
    expect(html).toContain('<script nonce="NONCE123" src="https://webview.test/paper.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="https://webview.test/katex.min.css">');
  });

  it('목차: 제목 텍스트 이스케이프, H2가 하나뿐이면 생략', () => {
    expect(buildPaperHtml(vm(), res)).toContain('<a href="#b">B &lt;i&gt;</a>');
    expect(buildPaperHtml(vm({ headings: [{ level: 2, text: 'A', id: 'a' }] }), res)).not.toContain('class="toc"');
  });

  it('URL이 없으면 원문 열기 버튼이 없다', () => {
    expect(buildPaperHtml(vm({ url: undefined }), res)).not.toContain('data-action="openExternal"');
  });

  it('본문이 없으면 초록을 펼쳐서 보여준다', () => {
    expect(buildPaperHtml(vm(), res)).toContain('<details><summary>초록');
    const noBody = buildPaperHtml(vm({ bodyHtml: undefined, headings: [] }), res);
    expect(noBody).toContain('<details open><summary>초록');
    expect(noBody).not.toContain('markdown-body');
  });

  it('안내 문구는 이스케이프한다', () => {
    const html = buildPaperHtml(vm({ notices: [{ kind: 'warning', text: 'Unexpected token < in JSON' }] }), res);
    expect(html).toContain('<div class="notice notice-warning" role="status">Unexpected token &lt; in JSON</div>');
  });

  it('없는 값은 표시하지 않는다', () => {
    const html = buildPaperHtml(vm({ authors: '', year: undefined, citation: undefined, source: undefined }), res);
    expect(html).not.toContain('class="authors"');
    expect(html).toContain('<p class="meta"></p>');
  });
});
