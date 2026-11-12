// arXiv API 조회 (DEV-PLAN §6.6.2). vscode 비의존. fetch를 주입받아 테스트에서 바꿀 수 있다.
// 응답(Atom XML)은 필요한 필드만 읽는 작은 파서로 처리한다. 외부 XML 라이브러리는 쓰지 않는다.
import { cleanText } from '../data/paperId';
import type { NewPaper } from '../data/paperOps';

export const ARXIV_API = 'https://export.arxiv.org/api/query';
const TIMEOUT_MS = 30000;

/** 네트워크 접근 함수. 확장은 전역 fetch를 넘기고, 테스트는 가짜를 넘긴다. */
export type FetchFn = typeof fetch;

export interface ArxivEntry {
  /** 버전을 포함한 arXiv ID (예: 2310.16485v2) */
  arxivId: string;
  /** 저장할 메타 정보 (source: arxiv, url: abs URL, citation 없음) */
  paper: NewPaper;
}

// 새 형식(2310.16485, 버전 선택)과 옛 형식(hep-th/9901001, cs.AI/0101001)
const ID_RE = /^((?:\d{4}\.\d{4,5})|(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}))(v\d+)?$/;

/**
 * 사용자가 입력한 arXiv ID나 URL에서 ID를 뽑는다. 못 뽑으면 undefined.
 * 예: 2310.16485, arXiv:2310.16485v2, https://arxiv.org/abs/2310.16485, https://arxiv.org/pdf/2310.16485v1.pdf
 */
export function parseArxivId(input: string): string | undefined {
  let s = input.trim().replace(/^arxiv:/i, '');
  const m = /^(?:https?:\/\/)?(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?(?:[?#].*)?$/i.exec(s);
  if (m) {
    s = m[1];
  }
  return ID_RE.test(s) ? s : undefined;
}

/** 검색어 → search_query. 낱말마다 all:을 붙여 모두 들어 있는 논문을 찾는다. */
export function buildSearchQuery(keywords: string): string | undefined {
  const words = keywords
    .replace(/["()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');
  return words.length > 0 ? words.map((w) => `all:${w}`).join(' AND ') : undefined;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return XML_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const tagText = (xml: string, tag: string): string | undefined => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeXml(m[1]) : undefined;
};

/** Atom 응답에서 논문 목록을 뽑는다. arXiv가 오류를 entry로 돌려준 경우(id가 /api/errors)는 뺀다. */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  for (const [, body] of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const id = tagText(body, 'id')?.trim() ?? '';
    const title = cleanText(tagText(body, 'title') ?? '');
    if (!id || id.includes('/api/errors') || !title) {
      continue;
    }
    const authors = [...body.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/g)]
      .map(([, a]) => cleanText(tagText(a, 'name') ?? ''))
      .filter((a) => a !== '');
    const year = new Date(tagText(body, 'published') ?? '').getUTCFullYear();
    const abstract = tagText(body, 'summary')?.trim();
    const arxivId = id.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
    entries.push({
      arxivId,
      paper: {
        title,
        authors: authors.join(', '),
        year: Number.isFinite(year) ? year : new Date().getUTCFullYear(),
        url: id,
        abstract: abstract || undefined,
        source: 'arxiv',
      },
    });
  }
  return entries;
}

/**
 * arXiv가 잠시 뒤 다시 시도하라고 거부했다: 429(요청 빈도 제한) 또는 503(일시적으로 처리 불가).
 * 서버가 알려 주면 몇 초 뒤에 다시 시도할 수 있는지 담는다.
 */
export class ArxivRetryLaterError extends Error {
  constructor(
    readonly status: 429 | 503,
    readonly retryAfterSeconds?: number,
  ) {
    super(`arXiv API error: HTTP ${status}${retryAfterSeconds !== undefined ? ` (Retry-After: ${retryAfterSeconds}s)` : ''}`);
    this.name = 'ArxivRetryLaterError';
  }
}

/** Retry-After 헤더(초 또는 HTTP 날짜) → 남은 초. 읽을 수 없으면 undefined */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  const v = value?.trim();
  if (!v) {
    return undefined;
  }
  if (/^\d+$/.test(v)) {
    return Number(v);
  }
  const date = Date.parse(v);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

async function query(params: URLSearchParams, fetchFn: FetchFn, signal?: AbortSignal): Promise<ArxivEntry[]> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetchFn(`${ARXIV_API}?${params}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (res.status === 429 || res.status === 503) {
    throw new ArxivRetryLaterError(res.status, parseRetryAfter(res.headers.get('retry-after')));
  }
  if (!res.ok) {
    throw new Error(`arXiv API error: HTTP ${res.status}`);
  }
  return parseArxivFeed(await res.text());
}

/** 검색어로 찾는다 (관련도순). */
export function searchArxiv(keywords: string, options: { fetch: FetchFn; maxResults?: number; signal?: AbortSignal }): Promise<ArxivEntry[]> {
  const searchQuery = buildSearchQuery(keywords);
  if (!searchQuery) {
    return Promise.resolve([]);
  }
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: '0',
    max_results: String(options.maxResults ?? 50),
    sortBy: 'relevance',
    sortOrder: 'descending',
  });
  return query(params, options.fetch, options.signal);
}

/** arXiv ID 하나를 조회한다. 없으면 undefined */
export async function fetchArxivById(arxivId: string, options: { fetch: FetchFn; signal?: AbortSignal }): Promise<ArxivEntry | undefined> {
  const entries = await query(new URLSearchParams({ id_list: arxivId, max_results: '1' }), options.fetch, options.signal);
  return entries[0];
}
