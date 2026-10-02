import { describe, expect, it } from 'vitest';
import type { Paper, PaperMeta } from '../../src/data/models';
import { formatCitation, paperDescription, paperTooltipLines, topicDescription, ellipsize } from '../../src/views/format';

const paper = (meta: Partial<PaperMeta>, extra: Partial<Paper> = {}): Paper => ({
  id: 'T/p',
  topicId: 'T',
  stem: 'p',
  meta: { title: 'Title', authors: '', ...meta },
  jsonPath: '/d/T/p.json',
  mdPath: '/d/T/p.md',
  ...extra,
});

describe('paperDescription', () => {
  it('"연도 · 인용수"', () => {
    expect(paperDescription(paper({ year: 2019, citation: 2737 }))).toBe('2019 · 2,737');
  });

  it('인용수 0은 표시하고, 없는 값은 생략한다', () => {
    expect(paperDescription(paper({ year: 2025, citation: 0 }))).toBe('2025 · 0');
    expect(paperDescription(paper({ year: 2025 }))).toBe('2025');
    expect(paperDescription(paper({}))).toBe('');
  });

  it('md가 없으면 "문서 없음"', () => {
    expect(paperDescription(paper({ year: 2019, citation: 1 }, { mdPath: undefined }))).toBe('2019 · 1 · 문서 없음');
  });
});

describe('topicDescription / formatCitation', () => {
  it('논문 수를 모르면 표시하지 않는다', () => {
    expect(topicDescription(undefined)).toBeUndefined();
    expect(topicDescription(0)).toBe('(0)');
    expect(topicDescription(275)).toBe('(275)');
  });

  it('천 단위 구분', () => {
    expect(formatCitation(1234567)).toBe('1,234,567');
    expect(formatCitation(undefined)).toBeUndefined();
  });
});

describe('ellipsize', () => {
  it('짧으면 그대로, 공백은 하나로', () => {
    expect(ellipsize('a  b\n c', 10)).toBe('a b c');
  });

  it('단어 경계에서 자르고 …를 붙인다', () => {
    expect(ellipsize('alpha beta gamma delta', 13)).toBe('alpha beta…');
  });

  it('공백이 없으면 글자 수로 자른다', () => {
    expect(ellipsize('가나다라마바사아자차', 4)).toBe('가나다라…');
  });
});

describe('paperTooltipLines', () => {
  it('있는 필드만 줄로 만든다 (source 포함)', () => {
    const t = paperTooltipLines(paper({ authors: 'A, B', year: 2019, citation: 5, source: 'pdf', url: 'http://x', abstract: 'abs' }));
    expect(t.title).toBe('Title');
    expect(t.lines).toEqual([
      { label: '저자', text: 'A, B' },
      { label: '연도', text: '2019 · 인용 5' },
      { label: '출처', text: 'pdf' },
      { label: 'URL', text: 'http://x' },
    ]);
    expect(t.abstract).toBe('abs');
  });

  it('md 없음, 메타 오류를 알린다', () => {
    const t = paperTooltipLines(paper({}, { mdPath: undefined, metaError: 'Unexpected end' }));
    expect(t.lines.map((l) => l.text)).toEqual(['요약 문서(.md)가 없습니다.', '메타 정보를 읽지 못했습니다: Unexpected end']);
    expect(t.abstract).toBeUndefined();
  });
});
