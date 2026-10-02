import { describe, expect, it } from 'vitest';
import { decodeStemUrl, fallbackMeta, parseMarkdownHeader, parseMetaJson } from '../../src/data/paperMeta';

describe('parseMetaJson', () => {
  it('모든 필드를 읽는다 (source 포함)', () => {
    const meta = parseMetaJson(
      JSON.stringify({ title: 'T', authors: 'A, B', year: 2019, url: 'http://x', abstract: 'ab', citation: 3, source: 'pdf' }),
    );
    expect(meta).toEqual({ title: 'T', authors: 'A, B', year: 2019, url: 'http://x', abstract: 'ab', citation: 3, source: 'pdf' });
  });

  it('선택 필드가 없으면 undefined', () => {
    const meta = parseMetaJson(JSON.stringify({ title: 'T', authors: 'A', year: 2020, url: 'u' }));
    expect(meta.citation).toBeUndefined();
    expect(meta.abstract).toBeUndefined();
    expect(meta.source).toBeUndefined();
  });

  it('타입이 틀린 필드는 무시한다', () => {
    const meta = parseMetaJson(JSON.stringify({ title: 1, authors: ['A'], year: '2020', citation: 'many' }));
    expect(meta).toMatchObject({ title: '', authors: '', year: undefined, citation: undefined });
  });

  it('citation 0은 유지한다', () => {
    expect(parseMetaJson(JSON.stringify({ title: 'T', citation: 0 })).citation).toBe(0);
  });

  it.each(['{"title": "x', '[1,2]', 'null', '"text"', ''])('객체가 아니거나 문법 오류면 예외: %s', (text) => {
    expect(() => parseMetaJson(text)).toThrow();
  });
});

describe('parseMarkdownHeader', () => {
  it('제목과 "저자 (연도)" 줄을 읽는다', () => {
    const md = '# A CLOSER LOOK\n\nWei-Yu Chen, Jia-Bin Huang (2019)\n\n## 🧩 Problem to Solve\n';
    expect(parseMarkdownHeader(md)).toEqual({ title: 'A CLOSER LOOK', authors: 'Wei-Yu Chen, Jia-Bin Huang', year: 2019 });
  });

  it('CRLF 줄바꿈도 처리한다', () => {
    expect(parseMarkdownHeader('# Title\r\n\r\nAuthor (2020)\r\n')).toEqual({ title: 'Title', authors: 'Author', year: 2020 });
  });

  it('저자 줄이 없으면 제목만', () => {
    expect(parseMarkdownHeader('# Title\n\n## Section\n')).toEqual({ title: 'Title' });
  });

  it('H1이 없으면 빈 객체', () => {
    expect(parseMarkdownHeader('## Only H2\ntext')).toEqual({});
  });
});

describe('decodeStemUrl', () => {
  it('base64 URL 파일 이름을 복원한다', () => {
    expect(decodeStemUrl('aHR0cDovL2FyeGl2Lm9yZy9hYnMvMTgwNC4wMzk5OXYz')).toBe('http://arxiv.org/abs/1804.03999v3');
  });

  it.each(['a_closer_look_at_few_shot_classification', 'valid_paper', 'abc'])('일반 파일 이름은 undefined: %s', (stem) => {
    expect(decodeStemUrl(stem)).toBeUndefined();
  });
});

describe('fallbackMeta', () => {
  it('헤더가 없으면 stem을 제목으로', () => {
    expect(fallbackMeta('some_stem', {})).toEqual({ title: 'some_stem', authors: '', year: undefined, url: undefined });
  });
});
