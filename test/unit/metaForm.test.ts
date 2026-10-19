import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, parseMetaForm, toFormValues, toMetaPatch, type MetaFormValues } from '../../src/data/metaForm';

const form = (v: Partial<MetaFormValues>): MetaFormValues => ({
  ...EMPTY_FORM,
  title: 'A Closer Look at Few-shot Classification',
  authors: 'Wei-Yu Chen, Yen-Cheng Liu',
  year: '2019',
  ...v,
});

describe('parseMetaForm', () => {
  it('공백을 정리하고 숫자를 바꾼다. 빈 선택 필드는 없는 것으로 본다', () => {
    const r = parseMetaForm(form({ title: '  A  Closer\nLook ', citation: '42', url: ' https://x.org/a ', abstract: '  ' }), 'add');
    expect(r).toEqual({
      ok: true,
      paper: { title: 'A Closer Look', authors: 'Wei-Yu Chen, Yen-Cheng Liu', year: 2019, url: 'https://x.org/a', abstract: undefined, citation: 42, source: 'manual' },
      paperId: undefined,
    });
  });

  it('필수 값과 형식을 검사한다', () => {
    const r = parseMetaForm({ ...EMPTY_FORM, year: '19', citation: '-1', url: 'ftp://x', source: 'web' }, 'edit');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['authors', 'citation', 'source', 'title', 'url', 'year']);
    }
  });

  it('source가 pdf이면 URL이 필요하다', () => {
    const r = parseMetaForm(form({ source: 'pdf' }), 'add');
    expect(r.ok === false && r.errors.url).toContain('pdf');
  });

  it('추가: 제목 slug가 비면 slug 형식의 파일 이름이 필요하다', () => {
    const korean = form({ title: '딥러닝 입문' });
    expect(parseMetaForm(korean, 'add')).toMatchObject({ ok: false, errors: { paperId: expect.any(String) } });
    expect(parseMetaForm({ ...korean, paperId: 'deep_learning_intro' }, 'add')).toMatchObject({ ok: true, paperId: 'deep_learning_intro' });
    expect(parseMetaForm(korean, 'edit').ok).toBe(true); // 편집은 파일 이름을 바꾸지 않는다.
  });
});

describe('toFormValues', () => {
  it('source가 없으면 arxiv로 본다', () => {
    expect(toFormValues({ title: 'T', authors: 'A', year: 2020, citation: 0 })).toMatchObject({ year: '2020', citation: '0', source: 'arxiv', url: '' });
  });
});

describe('toMetaPatch', () => {
  const initial = toFormValues({ title: 'T', authors: 'A', year: 2020, url: 'https://x', citation: 5, source: 'arxiv' });

  it('바꾼 필드만 담고, 비운 선택 필드는 null(삭제)', () => {
    const submitted = { ...initial, citation: '', title: 'New Title', abstract: '' };
    const r = parseMetaForm(submitted, 'edit');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(toMetaPatch(initial, submitted, r.paper)).toEqual({ title: 'New Title', citation: null });
    }
  });

  it('아무것도 바꾸지 않으면 빈 객체', () => {
    const r = parseMetaForm(initial, 'edit');
    expect(r.ok && toMetaPatch(initial, initial, r.paper)).toEqual({});
  });
});
