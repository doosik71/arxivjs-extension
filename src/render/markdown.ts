// 논문 요약 문서(md) → HTML (DEV-PLAN §6.4). 확장 호스트에서 렌더링해서 webview에 넘긴다.
import katexPlugin from '@vscode/markdown-it-katex';
import MarkdownIt from 'markdown-it';
import { parseMarkdownHeader } from '../data/paperMeta';

/** @types/markdown-it(CJS)는 인스턴스 interface를 export하지 않으므로 생성자에서 얻는다. */
type Md = InstanceType<typeof MarkdownIt>;

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  /** 목차용 H2 */
  headings: Heading[];
}

/** 제목 텍스트 → id. 이모지·기호는 빼고 한글 등 유니코드 문자는 남긴다. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug || 'section';
}

/** heading에 고유 id를 붙이고 목차용 H2를 모은다. */
function headingIds(md: Md): void {
  md.core.ruler.push('arxivjs_heading_ids', (state: MarkdownIt.StateCore) => {
    const used = new Map<string, number>();
    const headings: Heading[] = [];
    const { tokens } = state;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (open.type !== 'heading_open') {
        continue;
      }
      const inline = tokens[i + 1];
      const text = (inline.children ?? [])
        .filter((t) => t.type === 'text' || t.type === 'code_inline')
        .map((t) => t.content)
        .join('')
        .trim();
      const base = slugify(text);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      open.attrSet('id', id);
      const level = Number(open.tag.slice(1));
      if (level === 2) {
        headings.push({ level, text, id });
      }
    }
    (state.env as RenderEnv).headings = headings;
  });
}

interface RenderEnv extends Record<PropertyKey, unknown> {
  headings?: Heading[];
}

/** 링크는 새 창 대신 webview 스크립트가 가로채서 확장에 넘긴다. 위험한 스킴은 막는다. */
function safeLinks(md: Md): void {
  const defaultValidate = md.validateLink.bind(md);
  md.validateLink = (url: string) => defaultValidate(url) && !/^(file|vscode|command):/i.test(url.trim());
}

export function createMarkdownRenderer(): Md {
  // html: false → 본문의 <think>, <kw> 같은 텍스트를 태그로 해석하지 않고 이스케이프한다 (DEV-PLAN §2.6).
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  md.use(katexPlugin, { throwOnError: false, enableBareBlocks: false });
  md.use(headingIds);
  md.use(safeLinks);
  return md;
}

/**
 * 메타 헤더와 겹치는 문서 앞부분(첫 H1과 "저자 (연도)" 줄)을 지운다.
 * H1 앞에 다른 내용이 있으면 아무것도 지우지 않는다.
 */
export function stripLeadingHeader(source: string): string {
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') {
    i++;
  }
  if (i >= lines.length || !/^#\s+/.test(lines[i])) {
    return source;
  }
  const header = parseMarkdownHeader(lines.slice(i).join('\n'));
  let end = i + 1;
  if (header.authors !== undefined) {
    while (end < lines.length && lines[end].trim() === '') {
      end++;
    }
    end++; // 저자 줄
  }
  return lines.slice(end).join('\n').replace(/^\s*\n/, '');
}

const CACHE_SIZE = 20;

export class PaperRenderer {
  private readonly md = createMarkdownRenderer();
  /** key → 원문과 결과. 원문이 같을 때만 재사용하므로 따로 무효화할 필요가 없다. */
  private readonly cache = new Map<string, { source: string; result: RenderResult }>();

  /** 같은 key의 원문이 바뀌지 않았으면 이전 결과를 쓴다 (LRU 20개). */
  renderCached(key: string, source: string): RenderResult {
    const hit = this.cache.get(key);
    this.cache.delete(key);
    const result = hit && hit.source === source ? hit.result : this.render(source, { stripHeader: true });
    this.cache.set(key, { source, result });
    if (this.cache.size > CACHE_SIZE) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return result;
  }

  /** 본문 렌더링 */
  render(source: string, options: { stripHeader?: boolean } = {}): RenderResult {
    const env: RenderEnv = {};
    const text = options.stripHeader ? stripLeadingHeader(source) : source;
    const html = this.md.render(text, env);
    return { html, headings: env.headings ?? [] };
  }

  /** 초록처럼 한 단락짜리 텍스트 (수식 포함) */
  renderInline(text: string): string {
    return this.md.renderInline(text);
  }
}
