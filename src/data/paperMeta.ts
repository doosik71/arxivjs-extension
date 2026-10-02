// 논문 메타 정보 해석: json 파싱, md 헤더 추출, 파일 이름에서 URL 복원
import type { PaperMeta } from './models';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * json 텍스트를 PaperMeta로 바꾼다.
 * JSON 문법 오류이거나 최상위가 객체가 아니면 예외를 던진다.
 * 필드 타입이 틀리면 그 필드만 없는 것으로 본다. title이 없으면 빈 문자열이다.
 */
export function parseMetaJson(text: string): PaperMeta {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SyntaxError('메타 정보가 JSON 객체가 아니다');
  }
  const o = data as Record<string, unknown>;
  return {
    title: str(o.title) ?? '',
    authors: str(o.authors) ?? '',
    year: num(o.year),
    url: str(o.url),
    abstract: str(o.abstract),
    citation: num(o.citation),
    source: str(o.source),
  };
}

export interface MarkdownHeader {
  title?: string;
  authors?: string;
  year?: number;
}

const HEADER_SCAN_LINES = 20;
const H1_RE = /^#\s+(.+?)\s*#*\s*$/;
// 요약 문서 둘째 줄 형식: "저자1, 저자2 (2019)"
const BYLINE_RE = /^(.+?)\s*\((\d{4})\)\s*$/;

/** md 앞부분에서 첫 H1(제목)과 그 다음 "저자 (연도)" 줄을 뽑는다. */
export function parseMarkdownHeader(md: string): MarkdownHeader {
  const lines = md.split(/\r?\n/, HEADER_SCAN_LINES);
  const h1Index = lines.findIndex((l) => H1_RE.test(l));
  if (h1Index < 0) {
    return {};
  }
  const title = H1_RE.exec(lines[h1Index])![1];
  const byline = lines.slice(h1Index + 1).find((l) => l.trim() !== '');
  const m = byline && !byline.startsWith('#') ? BYLINE_RE.exec(byline.trim()) : null;
  return m ? { title, authors: m[1], year: Number(m[2]) } : { title };
}

const BASE64_RE = /^[A-Za-z0-9+_-]+={0,2}$/;

/** 파일 이름(stem)이 base64로 인코딩된 http(s) URL이면 복원한다. */
export function decodeStemUrl(stem: string): string | undefined {
  if (stem.length < 12 || !BASE64_RE.test(stem)) {
    return undefined;
  }
  const decoded = Buffer.from(stem, 'base64').toString('utf8');
  return /^https?:\/\/[^\s]+$/.test(decoded) ? decoded : undefined;
}

/** json 없이(또는 json이 깨져서) md·파일 이름만으로 만든 메타 정보 */
export function fallbackMeta(stem: string, header: MarkdownHeader): PaperMeta {
  return {
    title: header.title ?? stem,
    authors: header.authors ?? '',
    year: header.year,
    url: decodeStemUrl(stem),
  };
}
