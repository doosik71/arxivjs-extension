// media/topicModel.js (webview 정렬·필터 규칙) 검증. src/data/paperSort.ts와 결과가 같아야 한다.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Paper, PaperSort } from '../../src/data/models';
import { sortPapers } from '../../src/data/paperSort';
import { toTopicRow, type TopicRow } from '../../src/render/topicHtml';

interface Sort {
  key: PaperSort;
  dir: 1 | -1;
}
interface TopicModel {
  comparator(sort: Sort): (a: TopicRow, b: TopicRow) => number;
  nextSort(current: Sort, key: PaperSort): Sort;
  initialSort(defaultSort: string): Sort;
  tokenize(filter: string): string[];
  matches(row: TopicRow, tokens: string[], onlyMarkdown: boolean): boolean;
  matchesTopic(topic: HomeTopic, tokens: string[]): boolean;
  topicComparator(sort: 'name' | 'count'): (a: HomeTopic, b: HomeTopic) => number;
}
interface HomeTopic {
  id: string;
  label: string;
  count?: number;
}

const load = createRequire(__filename);
const model = load('../../media/topicModel.js') as TopicModel;

const paper = (stem: string, meta: Partial<Paper['meta']>, extra: Partial<Paper> = {}): Paper => ({
  id: `T/${stem}`,
  topicId: 'T',
  stem,
  meta: { title: stem, authors: '', ...meta },
  mdPath: `/d/T/${stem}.md`,
  ...extra,
});

const papers = [
  paper('b', { title: 'Beta', citation: 10, year: 2018, authors: 'Kim, Lee' }),
  paper('a', { title: 'alpha', citation: 10, year: 2020, authors: 'Park' }),
  paper('n', { title: 'No citation', year: 2024 }, { mdPath: undefined }),
  paper('c', { title: 'Gamma', citation: 500, year: 2015, authors: 'Kim' }),
  paper('z', { title: 'Zero', citation: 0 }),
];
const rows = papers.map(toTopicRow);
const ids = (list: TopicRow[]) => list.map((r) => r.id.slice(2));
const sortRows = (sort: Sort) => [...rows].sort(model.comparator(sort));

describe('topicModel 정렬', () => {
  it.each(['citation', 'year', 'title'] as const)('기본 방향은 확장 쪽 sortPapers(%s)와 같다', (key) => {
    const expected = sortPapers(papers, key).map((p) => p.stem);
    expect(ids(sortRows(model.initialSort(key)))).toEqual(expected);
  });

  it('방향을 뒤집어도 값이 없는 논문은 맨 뒤', () => {
    expect(ids(sortRows({ key: 'citation', dir: 1 }))).toEqual(['z', 'a', 'b', 'c', 'n']);
    expect(ids(sortRows({ key: 'year', dir: 1 }))).toEqual(['c', 'b', 'a', 'n', 'z']);
  });

  it('제목 내림차순', () => {
    expect(ids(sortRows({ key: 'title', dir: -1 }))).toEqual(['z', 'n', 'c', 'b', 'a']);
  });

  it('nextSort: 같은 열은 뒤집고, 다른 열은 기본 방향', () => {
    expect(model.nextSort({ key: 'citation', dir: -1 }, 'citation')).toEqual({ key: 'citation', dir: 1 });
    expect(model.nextSort({ key: 'citation', dir: -1 }, 'title')).toEqual({ key: 'title', dir: 1 });
    expect(model.nextSort({ key: 'title', dir: 1 }, 'year')).toEqual({ key: 'year', dir: -1 });
  });

  it('initialSort: 알 수 없는 값은 citation', () => {
    expect(model.initialSort('bogus')).toEqual({ key: 'citation', dir: -1 });
  });
});

describe('topicModel 필터', () => {
  const visible = (filter: string, onlyMarkdown = false) => {
    const tokens = model.tokenize(filter);
    return ids(rows.filter((r) => model.matches(r, tokens, onlyMarkdown)));
  };

  it('빈 필터는 모두', () => {
    expect(visible('')).toHaveLength(5);
    expect(visible('   ')).toHaveLength(5);
  });

  it('제목과 저자에서 대소문자 무시', () => {
    expect(visible('ALPHA')).toEqual(['a']);
    expect(visible('kim')).toEqual(['b', 'c']);
  });

  it('여러 낱말은 모두 들어 있어야 한다', () => {
    expect(visible('kim lee')).toEqual(['b']);
    expect(visible('kim gamma')).toEqual(['c']);
    expect(visible('kim nothing')).toEqual([]);
  });

  it('요약 문서 있는 것만', () => {
    expect(visible('', true)).not.toContain('n');
    expect(visible('', true)).toHaveLength(4);
  });
});

describe('topicModel 홈(주제 목록)', () => {
  const topics: HomeTopic[] = [
    { id: 'Large_Language_Model', label: 'Large Language Model', count: 120 },
    { id: 'Few-Shot_Learning', label: 'Few-Shot Learning', count: 87 },
    { id: 'GPT', label: 'GPT', count: 12 },
    { id: 'Zero-Shot_Learning', label: 'Zero-Shot Learning', count: 87 },
    { id: 'Unknown', label: 'Unknown' },
  ];
  const visible = (filter: string) => {
    const tokens = model.tokenize(filter);
    return topics.filter((t) => model.matchesTopic(t, tokens)).map((t) => t.id);
  };

  it('표시 이름과 폴더 이름에서 대소문자 무시로 찾는다', () => {
    expect(visible('shot')).toEqual(['Few-Shot_Learning', 'Zero-Shot_Learning']);
    expect(visible('large_language')).toEqual(['Large_Language_Model']); // 폴더 이름으로도 찾는다
    expect(visible('learning zero')).toEqual(['Zero-Shot_Learning']);
    expect(visible('')).toHaveLength(5);
  });

  it('정렬: 이름순, 논문 수순(같으면 이름, 모르는 수는 맨 뒤)', () => {
    const ids = (sort: 'name' | 'count') => [...topics].sort(model.topicComparator(sort)).map((t) => t.id);
    expect(ids('name')).toEqual(['Few-Shot_Learning', 'GPT', 'Large_Language_Model', 'Unknown', 'Zero-Shot_Learning']);
    expect(ids('count')).toEqual(['Large_Language_Model', 'Few-Shot_Learning', 'Zero-Shot_Learning', 'GPT', 'Unknown']);
  });
});
