import { describe, expect, it } from 'vitest';
import type { Paper, PaperMeta } from '../../src/data/models';
import { sortPapers } from '../../src/data/paperSort';

const paper = (stem: string, meta: Partial<PaperMeta>): Paper => ({
  id: `T/${stem}`,
  topicId: 'T',
  stem,
  meta: { title: stem, authors: '', ...meta },
});

const papers = [
  paper('b', { title: 'Beta', citation: 10, year: 2018 }),
  paper('a', { title: 'alpha', citation: 10, year: 2020 }),
  paper('n', { title: 'No citation', year: 2024 }),
  paper('c', { title: 'Gamma', citation: 500, year: 2015 }),
  paper('z', { title: 'Zero', citation: 0 }),
];
const stems = (list: Paper[]) => list.map((p) => p.stem);

describe('sortPapers', () => {
  it('citation: 인용수 내림차순, 동률이면 연도 내림차순, 없으면 맨 뒤', () => {
    expect(stems(sortPapers(papers, 'citation'))).toEqual(['c', 'a', 'b', 'z', 'n']);
  });

  it('year: 연도 내림차순, 없으면 맨 뒤', () => {
    expect(stems(sortPapers(papers, 'year'))).toEqual(['n', 'a', 'b', 'c', 'z']);
  });

  it('title: 대소문자 무시 사전순', () => {
    expect(stems(sortPapers(papers, 'title'))).toEqual(['a', 'b', 'c', 'n', 'z']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const before = stems(papers);
    sortPapers(papers, 'title');
    expect(stems(papers)).toEqual(before);
  });
});
