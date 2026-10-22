import { afterEach, describe, expect, it } from 'vitest';
import type { Paper } from '../../src/data/models';
import { currentLanguage, fmt, messagesFor, resolveLanguage, setLanguage, t } from '../../src/i18n';
import { en } from '../../src/i18n/en';
import { ko } from '../../src/i18n/ko';
import { buildHomeHtml, homeSummary } from '../../src/render/homeHtml';
import type { WebviewResources } from '../../src/render/html';
import { paperDescription } from '../../src/views/format';

const res: WebviewResources = { cspSource: 'https://webview.test', nonce: 'N', styleUris: [], scriptUris: [] };

const paper = (): Paper =>
  ({ id: 'T/p', stem: 'p', meta: { title: 'P', authors: 'A', year: 2019, citation: 1 }, jsonPath: 'p.json' }) as Paper;

/** 객체의 키 경로와 값 종류 ("common.delete:string") */
function shape(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? shape(value, `${prefix}${key}.`) : [`${prefix}${key}:${typeof value}`],
  );
}

afterEach(() => setLanguage('en'));

describe('resolveLanguage', () => {
  it.each([
    ['en', 'ko', 'en'],
    ['ko', 'en-US', 'ko'],
    ['auto', 'ko', 'ko'],
    ['auto', 'KO-kr', 'ko'],
    ['auto', 'en-US', 'en'],
    ['auto', 'ja', 'en'],
    [undefined, 'ko', 'en'],
    ['fr', 'ko', 'en'],
  ])('설정 %s, VS Code 언어 %s → %s', (setting, ui, expected) => {
    expect(resolveLanguage(setting, ui)).toBe(expected);
  });
});

describe('메시지 카탈로그', () => {
  it('한국어 카탈로그는 영어와 키·값 종류가 같다', () => {
    expect(shape(ko)).toEqual(shape(en));
  });

  it('기본 언어는 영어이고, setLanguage로 바꾼다', () => {
    expect(currentLanguage()).toBe('en');
    expect(t()).toBe(en);
    setLanguage('ko');
    expect(t()).toBe(ko);
    expect(messagesFor('en')).toBe(en);
  });

  it('webview 템플릿의 자리표시자는 두 언어가 같다', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const group of ['home', 'topic'] as const) {
      for (const [key, value] of Object.entries(en[group].script)) {
        expect(names((ko[group].script as Record<string, string>)[key]), `${group}.${key}`).toEqual(names(value));
      }
    }
  });
});

describe('fmt', () => {
  it('자리표시자를 바꾸고, 모르는 이름은 그대로 둔다', () => {
    expect(fmt('{a} / {b}편 {c}', { a: 1, b: '2' })).toBe('1 / 2편 {c}');
  });
});

describe('표시 언어 적용', () => {
  it('한국어로 바꾸면 트리·홈 문자열이 한국어가 된다', () => {
    setLanguage('ko');
    expect(paperDescription({ ...paper(), mdPath: undefined })).toBe('2019 · 1 · 문서 없음');
    expect(homeSummary([{ id: 'A', label: 'A', count: 3 }], true)).toBe('주제 1개 · 논문 3편');
  });

  it('홈 HTML의 lang과 webview 템플릿이 현재 언어를 따른다', () => {
    const vm = { folder: 'D:\\data', rows: [], notices: [] };
    expect(buildHomeHtml(vm, res)).toContain('<html lang="en">');
    setLanguage('ko');
    const html = buildHomeHtml(vm, res);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('주제 {topics}개');
  });
});
