import { describe, expect, it } from 'vitest';
import type { Paper } from '../../src/data/models';
import type { WebviewResources } from '../../src/render/html';
import { buildTopicHtml, jsonForScript, toTopicRow, type TopicViewModel } from '../../src/render/topicHtml';

const LINE_SEPARATOR = String.fromCharCode(0x2028);

const res: WebviewResources = {
  cspSource: 'https://webview.test',
  nonce: 'NONCE123',
  styleUris: ['https://webview.test/topic.css'],
  scriptUris: ['https://webview.test/topicModel.js', 'https://webview.test/topic.js'],
};

const paper = (over: Partial<Paper> = {}): Paper => ({
  id: 'T/p',
  topicId: 'T',
  stem: 'p',
  meta: { title: 'Title', authors: 'A', year: 2020, citation: 3, url: 'https://x', abstract: 'abs', source: 'arxiv' },
  jsonPath: '/d/T/p.json',
  mdPath: '/d/T/p.md',
  ...over,
});

/** HTML 안의 <script id="topic-data"> JSON을 꺼낸다. */
function embeddedData(html: string): { topicId: string; defaultSort: string; rows: unknown[] } {
  const m = /<script id="topic-data" type="application\/json">([^<]*)<\/script>/.exec(html);
  expect(m, 'topic-data 스크립트가 없다').not.toBeNull();
  return JSON.parse(m![1]);
}

describe('toTopicRow', () => {
  it('표에 필요한 값만 담는다 (URL, 초록 원문은 담지 않는다)', () => {
    expect(toTopicRow(paper())).toEqual({
      id: 'T/p',
      title: 'Title',
      authors: 'A',
      authorCount: 1,
      year: 2020,
      citation: 3,
      source: 'arxiv',
      hasUrl: true,
      hasMarkdown: true,
      hasAbstract: true,
      metaError: false,
    });
  });

  it('md 없음, 메타 오류, 값 없음', () => {
    const row = toTopicRow(paper({ mdPath: undefined, metaError: 'bad', meta: { title: 'T', authors: '' } }));
    expect(row).toMatchObject({ hasMarkdown: false, metaError: true, hasUrl: false, hasAbstract: false, year: undefined });
  });
});

describe('jsonForScript', () => {
  it('"</script>"와 줄 구분 문자를 그대로 두지 않고, 다시 파싱하면 원래 값', () => {
    const value = { title: `</script><script>alert(1)</script>${LINE_SEPARATOR}x` };
    const json = jsonForScript(value);
    expect(json).not.toContain('<');
    expect(json).not.toContain(LINE_SEPARATOR);
    expect(JSON.parse(json)).toEqual(value);
  });
});

describe('buildTopicHtml', () => {
  const vm = (over: Partial<TopicViewModel> = {}): TopicViewModel => ({
    topicId: 'Few-Shot_Learning',
    topicLabel: 'Few-Shot <Learning>',
    rows: [toTopicRow(paper({ meta: { title: 'A </script> title', authors: 'X' } }))],
    defaultSort: 'year',
    notices: [],
    ...over,
  });

  it('데이터 JSON을 안전하게 넣고, 그대로 꺼낼 수 있다', () => {
    const html = buildTopicHtml(vm(), res);
    const data = embeddedData(html);
    expect(data).toMatchObject({ topicId: 'Few-Shot_Learning', defaultSort: 'year' });
    expect(data.rows).toEqual([expect.objectContaining({ title: 'A </script> title' })]);
  });

  it('주제 이름은 이스케이프하고, 논문 수를 표시한다', () => {
    const html = buildTopicHtml(vm(), res);
    expect(html).toContain('<h1 class="topic-title">Few-Shot &lt;Learning&gt;</h1>');
    expect(html).toContain('>1편</span>');
  });

  it('스크립트는 순서대로 nonce를 붙여 넣는다 (모델 → 화면)', () => {
    const html = buildTopicHtml(vm(), res);
    const model = html.indexOf('<script nonce="NONCE123" src="https://webview.test/topicModel.js">');
    const view = html.indexOf('<script nonce="NONCE123" src="https://webview.test/topic.js">');
    expect(model).toBeGreaterThan(0);
    expect(view).toBeGreaterThan(model);
    expect(html).toContain("script-src 'nonce-NONCE123'");
  });

  it('정렬 열, 필터, Reload 버튼', () => {
    const html = buildTopicHtml(vm(), res);
    for (const key of ['title', 'year', 'citation']) {
      expect(html).toContain(`data-sort="${key}"`);
    }
    expect(html).toContain('id="filter"');
    expect(html).toContain('id="onlyMarkdown"');
    expect(html).toContain('data-action="reload"');
  });

  it('안내 문구', () => {
    const html = buildTopicHtml(vm({ rows: [], notices: [{ kind: 'error', text: '주제 폴더를 찾을 수 없습니다.' }] }), res);
    expect(html).toContain('notice-error');
    expect(html).toContain('>0편</span>');
  });
});
