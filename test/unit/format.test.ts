import { describe, expect, it } from 'vitest';
import type { Paper, PaperMeta } from '../../src/data/models';
import { AUTHORS_PREVIEW_CHARS, authorsPreview, citationText, countAuthors, ellipsize, formatCitation, paperDescription, paperTooltipLines, topicDescription } from '../../src/views/format';

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

describe('citationText', () => {
  it('"제목. 저자 (연도). URL"', () => {
    expect(citationText(paper({ title: 'A Closer Look', authors: 'W. Chen, J. Huang', year: 2019, url: 'http://arxiv.org/abs/1' }))).toBe(
      'A Closer Look. W. Chen, J. Huang (2019). http://arxiv.org/abs/1',
    );
  });

  it('없는 값은 생략한다', () => {
    expect(citationText(paper({ title: 'T' }))).toBe('T');
    expect(citationText(paper({ title: 'T', year: 2020 }))).toBe('T. (2020)');
  });
});

describe('countAuthors / authorsPreview (저자가 아주 많은 논문)', () => {
  const many = Array.from({ length: 1351 }, (_, i) => `Author ${i + 1}`).join(', ');

  it('쉼표로 구분한 저자 수', () => {
    expect(countAuthors('A, B, C')).toBe(3);
    expect(countAuthors('Single Author')).toBe(1);
    expect(countAuthors('')).toBe(0);
    expect(countAuthors(many)).toBe(1351);
  });

  it('짧으면 그대로, 길면 자르고 전체 저자 수를 붙인다', () => {
    expect(authorsPreview('A, B')).toBe('A, B');
    const preview = authorsPreview(many);
    expect(preview.length).toBeLessThan(AUTHORS_PREVIEW_CHARS + 20);
    expect(preview).toMatch(/… \(총 1,351명\)$/);
    expect(preview.startsWith('Author 1, Author 2,')).toBe(true);
  });

  it('툴팁의 저자 줄도 줄인다', () => {
    const t = paperTooltipLines(paper({ authors: many }));
    expect(t.lines[0].text).toMatch(/\(총 1,351명\)$/);
  });

  it('정보 복사에는 저자를 모두 넣는다', () => {
    expect(citationText(paper({ title: 'Gemini', authors: many }))).toContain('Author 1351');
  });
});
