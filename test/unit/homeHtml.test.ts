import { describe, expect, it } from 'vitest';
import { buildHomeHtml, homeSummary, type HomeViewModel } from '../../src/render/homeHtml';
import type { WebviewResources } from '../../src/render/html';

const res: WebviewResources = {
  cspSource: 'https://webview.test',
  nonce: 'NONCE123',
  styleUris: ['https://webview.test/home.css'],
  scriptUris: ['https://webview.test/topicModel.js', 'https://webview.test/home.js'],
};

const vm = (over: Partial<HomeViewModel> = {}): HomeViewModel => ({
  folder: 'D:\\data\\arxivjs <test>',
  rows: [
    { id: 'Few-Shot_Learning', label: 'Few-Shot Learning', count: 87 },
    { id: 'GPT', label: 'GPT </script>', count: 1200 },
    { id: 'Unknown', label: 'Unknown' },
  ],
  notices: [],
  ...over,
});

function embeddedData(html: string): { folder: string; rows: { id: string; label: string; count?: number }[] } {
  const m = /<script id="home-data" type="application\/json">([^<]*)<\/script>/.exec(html);
  expect(m, 'home-data 스크립트가 없다').not.toBeNull();
  return JSON.parse(m![1]);
}

describe('buildHomeHtml', () => {
  it('주제 데이터를 JSON으로 안전하게 넣는다', () => {
    const data = embeddedData(buildHomeHtml(vm(), res));
    expect(data.rows).toHaveLength(3);
    expect(data.rows[1].label).toBe('GPT </script>');
    expect(data.folder).toBe('D:\\data\\arxivjs <test>');
  });

  it('요약: 논문 수를 아직 모르는 주제가 있으면 "세는 중", 모두 알면 합계', () => {
    expect(buildHomeHtml(vm(), res)).toContain('주제 3개 · 논문 수 세는 중…');
    const known = vm({ rows: [{ id: 'A', label: 'A', count: 87 }, { id: 'B', label: 'B', count: 1200 }] });
    expect(buildHomeHtml(known, res)).toContain('주제 2개 · 논문 1,287편');
  });

  it('첫 화면용 데이터에는 논문 수가 없어도 된다 (비동기로 채운다)', () => {
    const data = embeddedData(buildHomeHtml(vm({ rows: [{ id: 'A', label: 'A' }] }), res));
    expect(data.rows).toEqual([{ id: 'A', label: 'A' }]);
  });

  it('데이터 폴더 경로는 이스케이프한다', () => {
    expect(buildHomeHtml(vm(), res)).toContain('arxivjs &lt;test&gt;</p>');
  });

  it('필터, 정렬, Reload, 폴더 선택', () => {
    const html = buildHomeHtml(vm(), res);
    expect(html).toContain('id="filter"');
    expect(html).toContain('data-sort="name"');
    expect(html).toContain('data-sort="count"');
    expect(html).toContain('data-action="reload"');
    expect(html).toContain('data-action="selectDataFolder"');
  });

  it('스크립트는 모델 → 화면 순서, nonce와 CSP', () => {
    const html = buildHomeHtml(vm(), res);
    const model = html.indexOf('src="https://webview.test/topicModel.js"');
    const view = html.indexOf('src="https://webview.test/home.js"');
    expect(model).toBeGreaterThan(0);
    expect(view).toBeGreaterThan(model);
    expect(html).toContain("script-src 'nonce-NONCE123'");
  });

  it('데이터 폴더가 없으면 요약·경로 없이 안내만', () => {
    const html = buildHomeHtml(vm({ folder: undefined, rows: [], notices: [{ kind: 'info', text: '데이터 폴더가 설정되지 않았습니다.' }] }), res);
    expect(html).toContain('notice-info');
    expect(html).not.toContain('class="folder"');
    expect(html).toContain('<span class="count" id="summary"></span>');
  });
});

describe('homeSummary', () => {
  const rows = [
    { id: 'A', label: 'A', count: 3 },
    { id: 'B', label: 'B' },
  ];

  it('다 세기 전/후', () => {
    expect(homeSummary(rows, false)).toBe('주제 2개 · 논문 수 세는 중…');
    expect(homeSummary(rows, true)).toBe('주제 2개 · 논문 3편');
    expect(homeSummary([], true)).toBe('주제 0개');
  });
});
