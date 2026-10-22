// 메타 정보 입력 폼의 값 검사와 변환 (DEV-PLAN §6.6.3). vscode 비의존.
import { t } from '../i18n';
import type { PaperMeta } from './models';
import { cleanText, isValidPaperId, slugifyPaperTitle } from './paperId';
import { PAPER_SOURCES, type MetaPatch, type NewPaper, type PaperSource } from './paperOps';

/** 폼 필드 값 (모두 문자열) */
export interface MetaFormValues {
  title: string;
  authors: string;
  year: string;
  url: string;
  abstract: string;
  citation: string;
  source: string;
  /** 추가할 때만: 제목에 영문·숫자가 없을 때 쓸 파일 이름 */
  paperId: string;
}

export type MetaFormErrors = Partial<Record<keyof MetaFormValues, string>>;

export type MetaFormResult = { ok: true; paper: NewPaper; paperId?: string } | { ok: false; errors: MetaFormErrors };

export const EMPTY_FORM: MetaFormValues = { title: '', authors: '', year: '', url: '', abstract: '', citation: '', source: 'manual', paperId: '' };

/** 기존 메타 정보 → 폼 값. source가 없거나 모르는 값이면 arxiv로 본다 (형식 명세 §8.1.2). */
export function toFormValues(meta: PaperMeta): MetaFormValues {
  const source = PAPER_SOURCES.includes(meta.source as PaperSource) ? (meta.source as PaperSource) : 'arxiv';
  return {
    title: meta.title,
    authors: meta.authors,
    year: meta.year === undefined ? '' : String(meta.year),
    url: meta.url ?? '',
    abstract: meta.abstract ?? '',
    citation: meta.citation === undefined ? '' : String(meta.citation),
    source,
    paperId: '',
  };
}

const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

/** 폼 값을 검사해 NewPaper로 바꾼다. mode가 add이면 paperId도 검사한다. */
export function parseMetaForm(values: MetaFormValues, mode: 'add' | 'edit'): MetaFormResult {
  const errors: MetaFormErrors = {};
  const title = cleanText(values.title);
  const authors = cleanText(values.authors);
  const yearText = values.year.trim();
  const url = values.url.trim();
  const abstract = values.abstract.trim();
  const citationText = values.citation.trim();
  const source = values.source as PaperSource;

  const m = t().metaForm;
  if (!title) {
    errors.title = m.titleRequired;
  }
  if (!authors) {
    errors.authors = m.authorsRequired;
  }
  if (!/^\d{4}$/.test(yearText)) {
    errors.year = m.yearInvalid;
  }
  if (!PAPER_SOURCES.includes(source)) {
    errors.source = m.sourceRequired;
  }
  if (url && !isHttpUrl(url)) {
    errors.url = m.urlInvalid;
  } else if (!url && source === 'pdf') {
    errors.url = m.pdfUrlRequired;
  }
  if (citationText && !/^\d+$/.test(citationText)) {
    errors.citation = m.citationInvalid;
  }

  let paperId: string | undefined;
  if (mode === 'add' && title && !slugifyPaperTitle(title)) {
    paperId = values.paperId.trim();
    if (!isValidPaperId(paperId)) {
      errors.paperId = m.paperIdRequired;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    paper: {
      title,
      authors,
      year: Number(yearText),
      url: url || undefined,
      abstract: abstract || undefined,
      citation: citationText ? Number(citationText) : undefined,
      source,
    },
    paperId,
  };
}

const PATCH_FIELDS = ['title', 'authors', 'year', 'url', 'abstract', 'citation', 'source'] as const;

/**
 * 편집 결과 → .json 수정 값. 사용자가 바꾼 필드만 담는다 (바꾸지 않은 필드는 파일에서 그대로 둔다).
 * 비운 선택 필드(url, abstract, citation)는 null(필드 삭제)이다.
 */
export function toMetaPatch(initial: MetaFormValues, submitted: MetaFormValues, paper: NewPaper): MetaPatch {
  const patch: MetaPatch = {};
  for (const key of PATCH_FIELDS) {
    if (initial[key].trim() === submitted[key].trim()) {
      continue;
    }
    const value = paper[key];
    patch[key] = value === undefined ? null : value;
  }
  return patch;
}
