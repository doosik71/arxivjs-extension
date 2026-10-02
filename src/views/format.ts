// 트리·패널에 표시할 문자열 만들기 (vscode 비의존)
import type { Paper } from '../data/models';

const numberFormat = new Intl.NumberFormat('en-US');

export const ABSTRACT_PREVIEW_CHARS = 400;

/** 인용수 표시: 2737 → "2,737", 없으면 undefined */
export function formatCitation(citation: number | undefined): string | undefined {
  return citation === undefined ? undefined : numberFormat.format(citation);
}

/** 논문 노드 description: "2019 · 2,737" (DEV-PLAN §3.2). 없는 값은 생략한다. */
export function paperDescription(paper: Paper): string {
  const parts = [paper.meta.year?.toString(), formatCitation(paper.meta.citation)].filter(Boolean);
  if (!paper.mdPath) {
    parts.push('문서 없음');
  }
  return parts.join(' · ');
}

/** 주제 노드 description: 논문 수를 읽은 뒤에만 "(87)" */
export function topicDescription(paperCount: number | undefined): string | undefined {
  return paperCount === undefined ? undefined : `(${paperCount})`;
}

/** 길이를 넘으면 단어 경계에서 자르고 "…"를 붙인다. */
export function ellipsize(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) {
    return flat;
  }
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface TooltipLine {
  label?: string;
  text: string;
}

/** 논문 툴팁 내용 (렌더링은 뷰에서 이스케이프하며 한다) */
export function paperTooltipLines(paper: Paper): { title: string; lines: TooltipLine[]; abstract?: string } {
  const { meta } = paper;
  const lines: TooltipLine[] = [];
  if (meta.authors) {
    lines.push({ label: '저자', text: meta.authors });
  }
  const yearCite = [meta.year?.toString(), meta.citation !== undefined ? `인용 ${formatCitation(meta.citation)}` : undefined]
    .filter(Boolean)
    .join(' · ');
  if (yearCite) {
    lines.push({ label: '연도', text: yearCite });
  }
  if (meta.source) {
    lines.push({ label: '출처', text: meta.source });
  }
  if (meta.url) {
    lines.push({ label: 'URL', text: meta.url });
  }
  if (!paper.mdPath) {
    lines.push({ text: '요약 문서(.md)가 없습니다.' });
  }
  if (paper.metaError) {
    lines.push({ text: `메타 정보를 읽지 못했습니다: ${paper.metaError}` });
  }
  return {
    title: meta.title,
    lines,
    abstract: meta.abstract ? ellipsize(meta.abstract, ABSTRACT_PREVIEW_CHARS) : undefined,
  };
}
