import { describe, expect, it } from 'vitest';
import { EMPTY_FORM } from '../../src/data/metaForm';
import type { WebviewResources } from '../../src/render/html';
import { buildMetaFormHtml } from '../../src/render/metaFormHtml';

const res: WebviewResources = {
  cspSource: 'https://webview.test',
  nonce: 'NONCE123',
  styleUris: ['https://webview.test/metaForm.css'],
  scriptUris: ['https://webview.test/metaForm.js'],
};

describe('buildMetaFormHtml', () => {
  it('값을 이스케이프해서 채운다', () => {
    const html = buildMetaFormHtml(
      {
        heading: '편집 <x>',
        mode: 'edit',
        values: { ...EMPTY_FORM, title: 'A "quoted" <title>', abstract: '</textarea><script>alert(1)</script>', source: 'pdf' },
      },
      res,
    );
    expect(html).toContain('value="A &quot;quoted&quot; &lt;title&gt;"');
    expect(html).toContain('&lt;/textarea&gt;&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<option value="pdf" selected>');
    expect(html).toContain('<title>편집 &lt;x&gt;</title>');
    expect(html).toContain('script-src \'nonce-NONCE123\'');
  });

  it('파일 이름 칸은 추가할 때만 있다', () => {
    expect(buildMetaFormHtml({ heading: 'h', mode: 'add', values: EMPTY_FORM }, res)).toContain('id="f-paperId"');
    expect(buildMetaFormHtml({ heading: 'h', mode: 'edit', values: EMPTY_FORM }, res)).not.toContain('id="f-paperId"');
  });
});
