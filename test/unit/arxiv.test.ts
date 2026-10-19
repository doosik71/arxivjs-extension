import { describe, expect, it, vi } from 'vitest';
import {
  ARXIV_API,
  buildSearchQuery,
  decodeXml,
  fetchArxivById,
  parseArxivFeed,
  parseArxivId,
  searchArxiv,
  type FetchFn,
} from '../../src/sources/arxiv';

// export.arxiv.org/api/query 응답 형식 (실제 응답을 줄인 것)
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: search_query=all:few AND all:shot</title>
  <id>http://arxiv.org/api/abc</id>
  <entry>
    <id>http://arxiv.org/abs/1904.04232v2</id>
    <updated>2020-01-12T00:00:00Z</updated>
    <published>2019-04-08T17:59:55Z</published>
    <title>A Closer Look at Few-shot
  Classification</title>
    <summary>  Few-shot classification aims to learn a classifier &amp; to recognize
unseen classes &lt;given&gt; few examples.
</summary>
    <author>
      <name>Wei-Yu Chen</name>
    </author>
    <author>
      <name>Yen-Cheng Liu</name>
      <arxiv:affiliation xmlns:arxiv="http://arxiv.org/schemas/atom">Georgia Tech</arxiv:affiliation>
    </author>
    <link href="http://arxiv.org/abs/1904.04232v2" rel="alternate" type="text/html"/>
    <category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v1</id>
    <published>1999-01-01T00:00:00Z</published>
    <title>Caf&#233; &#x2014; Old Style ID</title>
    <summary>Old.</summary>
    <author><name>Someone</name></author>
  </entry>
</feed>`;

const ERROR_FEED = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_1234</id>
    <title>Error</title>
    <summary>incorrect id format for 1234</summary>
  </entry>
</feed>`;

const fakeFetch = (body: string, status = 200) => vi.fn<FetchFn>(async () => new Response(body, { status }));

describe('parseArxivId', () => {
  it.each([
    ['2310.16485', '2310.16485'],
    ['2310.16485v2', '2310.16485v2'],
    ['  arXiv:2310.16485 ', '2310.16485'],
    ['https://arxiv.org/abs/2310.16485v2', '2310.16485v2'],
    ['http://arxiv.org/pdf/2310.16485v1.pdf', '2310.16485v1'],
    ['arxiv.org/abs/2310.16485?context=cs', '2310.16485'],
    ['https://export.arxiv.org/abs/1904.04232', '1904.04232'],
    ['hep-th/9901001', 'hep-th/9901001'],
    ['https://arxiv.org/abs/cs.AI/0101001v2', 'cs.AI/0101001v2'],
  ])('%s → %s', (input, id) => expect(parseArxivId(input)).toBe(id));

  it.each(['', 'hello', '2310.164', 'https://example.com/abs/2310.16485', '2310.16485 extra'])('거부: "%s"', (input) =>
    expect(parseArxivId(input)).toBeUndefined(),
  );
});

describe('buildSearchQuery', () => {
  it('낱말마다 all:을 붙여 AND로 잇는다', () => {
    expect(buildSearchQuery('  few-shot   classification ')).toBe('all:few-shot AND all:classification');
  });
  it('따옴표·괄호는 지운다. 빈 검색어는 undefined', () => {
    expect(buildSearchQuery('"meta (learning)"')).toBe('all:meta AND all:learning');
    expect(buildSearchQuery('   ')).toBeUndefined();
  });
});

describe('decodeXml', () => {
  it('이름·숫자 엔티티를 디코드한다', () => {
    expect(decodeXml('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#233; &#x2014; &unknown;')).toBe(`a & b <c> "d" 'e' é — &unknown;`);
  });
});

describe('parseArxivFeed', () => {
  it('제목·저자 공백을 정리하고, 연도와 abs URL, arxiv source를 채운다', () => {
    const [first, second] = parseArxivFeed(FEED);
    expect(first).toEqual({
      arxivId: '1904.04232v2',
      paper: {
        title: 'A Closer Look at Few-shot Classification',
        authors: 'Wei-Yu Chen, Yen-Cheng Liu',
        year: 2019,
        url: 'http://arxiv.org/abs/1904.04232v2',
        abstract: 'Few-shot classification aims to learn a classifier & to recognize\nunseen classes <given> few examples.',
        source: 'arxiv',
      },
    });
    expect(second.arxivId).toBe('hep-th/9901001v1');
    expect(second.paper.title).toBe('Café — Old Style ID');
    expect(second.paper.year).toBe(1999);
  });

  it('arXiv가 돌려준 오류 entry는 뺀다', () => {
    expect(parseArxivFeed(ERROR_FEED)).toEqual([]);
  });
});

describe('searchArxiv / fetchArxivById', () => {
  it('검색 URL을 만들어 부르고 결과를 돌려준다', async () => {
    const fetch = fakeFetch(FEED);
    const entries = await searchArxiv('few shot', { fetch, maxResults: 20 });
    expect(entries).toHaveLength(2);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe(ARXIV_API);
    expect(url.searchParams.get('search_query')).toBe('all:few AND all:shot');
    expect(url.searchParams.get('max_results')).toBe('20');
    expect(url.searchParams.get('sortBy')).toBe('relevance');
  });

  it('빈 검색어는 부르지 않는다', async () => {
    const fetch = fakeFetch(FEED);
    expect(await searchArxiv('  ', { fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ID 조회: id_list로 부르고, 없으면 undefined', async () => {
    const fetch = fakeFetch(FEED);
    expect((await fetchArxivById('1904.04232', { fetch }))?.arxivId).toBe('1904.04232v2');
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('id_list')).toBe('1904.04232');
    expect(await fetchArxivById('1234', { fetch: fakeFetch(ERROR_FEED) })).toBeUndefined();
  });

  it('HTTP 오류는 예외', async () => {
    await expect(searchArxiv('x', { fetch: fakeFetch('', 503) })).rejects.toThrow(/HTTP 503/);
  });

  it('취소 신호를 fetch에 넘긴다', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<FetchFn>(async (_url, init) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(fetchArxivById('1904.04232', { fetch, signal: controller.signal })).rejects.toThrow(/aborted/);
  });
});
