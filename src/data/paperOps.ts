// 논문 저장·메타 수정·이동·삭제·요약 삭제 (DEV-PLAN §6.6.2–6.6.6, 형식 명세 §9). vscode 비의존.
import * as path from 'node:path';
import { t } from '../i18n';
import { DataError, isNotFound } from './errors';
import type { Paper, PaperMeta, Topic } from './models';
import { cleanText, isValidPaperId, slugifyPaperTitle } from './paperId';
import { parseMetaJson } from './paperMeta';
import type { DataOpsContext } from './topicOps';

export const PAPER_SOURCES = ['arxiv', 'pdf', 'manual'] as const;
export type PaperSource = (typeof PAPER_SOURCES)[number];

/** 새로 저장할 논문의 메타 정보. 저장 순서도 이 순서를 따른다. */
export interface NewPaper {
  title: string;
  authors: string;
  year: number;
  url?: string;
  abstract?: string;
  citation?: number;
  source: PaperSource;
}

/** .json에 저장하지 않는 필드 (형식 명세 §8.1.3) */
const FORBIDDEN_FIELDS = ['id', 'hasSummary', 'hasHighlights'];
/** 논문 번들 중 이동·삭제할 때 함께 다루는 파일 */
const BUNDLE_EXTS = ['.json', '.md', '.hlt', '.txt'] as const;
/** 요약 백업 (만들지 않고, 이동할 때 원본 토픽의 것만 지운다) */
const BACKUP_EXTS = ['.bak', '.md.bak'] as const;

const bundlePath = (topic: Topic, stem: string, ext: string) => path.join(topic.path, stem + ext);

/** JSON.stringify(obj, null, 2), 끝 줄바꿈 없음 (형식 명세 §8.1) */
export function formatMetaJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2);
}

/** 저장할 객체: 공백을 정리하고, 값이 없는 선택 필드는 뺀다. */
export function toStoredPaper(paper: NewPaper): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    title: cleanText(paper.title),
    authors: cleanText(paper.authors),
    year: paper.year,
  };
  if (paper.url) {
    stored.url = paper.url;
  }
  if (paper.abstract) {
    stored.abstract = paper.abstract;
  }
  if (paper.citation !== undefined) {
    stored.citation = paper.citation;
  }
  stored.source = paper.source;
  return stored;
}

/**
 * 새 논문의 paperId. 제목 slug가 비어 있지 않으면 그것을 쓰고(requested는 무시),
 * 비어 있으면 requested가 slug 형식일 때만 쓴다. 쓸 수 있는 값이 없으면 undefined (형식 명세 §7.3).
 */
export function resolvePaperId(title: string, requested?: string): string | undefined {
  const slug = slugifyPaperTitle(cleanText(title));
  if (slug) {
    return slug;
  }
  return requested !== undefined && isValidPaperId(requested) ? requested : undefined;
}

async function exists(ctx: DataOpsContext, p: string): Promise<boolean> {
  try {
    await ctx.fs.stat(p);
    return true;
  } catch (err) {
    if (isNotFound(err)) {
      return false;
    }
    throw err;
  }
}

async function removeIfExists(ctx: DataOpsContext, p: string): Promise<boolean> {
  try {
    await ctx.writer.removeFile(p);
    return true;
  } catch (err) {
    if (isNotFound(err)) {
      return false;
    }
    throw err;
  }
}

async function moveIfExists(ctx: DataOpsContext, from: string, to: string): Promise<boolean> {
  try {
    await ctx.writer.move(from, to);
    return true;
  } catch (err) {
    if (isNotFound(err)) {
      return false;
    }
    throw err;
  }
}

/** 같은 주제에 이 paperId의 .json이 있는지 */
export function paperExists(ctx: DataOpsContext, topic: Topic, paperId: string): Promise<boolean> {
  return exists(ctx, bundlePath(topic, paperId, '.json'));
}

/**
 * 새 논문의 .json을 저장하고 paperId를 돌려준다 (형식 명세 §9.1).
 * 같은 paperId가 이미 있으면 overwrite일 때만 덮어쓰고, 아니면 conflict.
 */
export async function savePaper(
  ctx: DataOpsContext,
  topic: Topic,
  paper: NewPaper,
  options: { paperId?: string; overwrite?: boolean } = {},
): Promise<string> {
  const paperId = resolvePaperId(paper.title, options.paperId);
  const target = bundlePath(topic, paperId ?? '', '.json');
  if (!paperId) {
    throw new DataError('conflict', target, t().data.noSlug);
  }
  if (!options.overwrite && (await exists(ctx, target))) {
    throw new DataError('conflict', target, t().data.duplicatePaperId(paperId));
  }
  await ctx.writer.writeTextAtomic(target, formatMetaJson(toStoredPaper(paper)));
  return paperId;
}

/** .json을 디스크에서 다시 읽어 객체로 돌려준다. 읽을 수 없으면 notFound, 깨졌으면 conflict */
async function readJsonObject(ctx: DataOpsContext, jsonPath: string): Promise<Record<string, unknown>> {
  const text = await ctx.fs.readText(jsonPath);
  try {
    parseMetaJson(text); // 객체인지 확인한다.
  } catch (err) {
    throw new DataError('conflict', jsonPath, t().data.metaUnreadable(err instanceof Error ? err.message : String(err)));
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** 편집 폼의 초깃값용: 디스크의 최신 메타 정보 */
export async function readPaperMeta(ctx: DataOpsContext, paper: Paper): Promise<PaperMeta> {
  if (!paper.jsonPath) {
    throw new DataError('notFound', paper.id, t().data.noMeta);
  }
  return parseMetaJson(await ctx.fs.readText(paper.jsonPath));
}

/** 메타 정보 수정 값. null은 그 필드를 지운다는 뜻이다. 없는 키는 건드리지 않는다. */
export type MetaPatch = Partial<Record<keyof NewPaper, string | number | null>>;

/**
 * read-modify-write로 .json을 고친다 (형식 명세 §8.1.5). 모르는 필드는 남기고, 저장 금지 필드는 뺀다.
 * paperId(파일 이름)는 제목이 바뀌어도 그대로다.
 */
export async function updateMeta(ctx: DataOpsContext, paper: Paper, patch: MetaPatch): Promise<void> {
  if (!paper.jsonPath) {
    throw new DataError('notFound', paper.id, t().data.noMeta);
  }
  const obj = await readJsonObject(ctx, paper.jsonPath);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete obj[key];
    } else if (value !== undefined) {
      obj[key] = key === 'title' || key === 'authors' ? cleanText(String(value)) : value;
    }
  }
  for (const key of FORBIDDEN_FIELDS) {
    delete obj[key];
  }
  await ctx.writer.writeTextAtomic(paper.jsonPath, formatMetaJson(obj));
}

/** dateAdded → date → epoch (형식 명세 §9.3) */
function addedTime(obj: Record<string, unknown>): number {
  const raw = typeof obj.dateAdded === 'string' ? obj.dateAdded : typeof obj.date === 'string' ? obj.date : undefined;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export type MoveResult =
  /** 대상에 같은 논문이 없어 그대로 옮겼다 */
  | 'moved'
  /** 대상에 같은 논문이 있었고, 옮긴 논문이 더 최신이라 대상을 바꿨다 */
  | 'replaced'
  /** 대상에 같은 논문이 있었고, 대상이 최신이거나 같아 원본을 지웠다 */
  | 'keptTarget';

/**
 * 논문을 다른 주제로 옮긴다 (형식 명세 §9.3).
 * 어느 경우든 원본 주제의 백업 파일을 지우므로, 끝나면 원본 주제에는 그 paperId의 파일이 남지 않는다.
 */
export async function movePaper(ctx: DataOpsContext, paper: Paper, from: Topic, to: Topic): Promise<MoveResult> {
  if (!paper.jsonPath) {
    throw new DataError('notFound', paper.id, t().data.cannotMoveNoMeta);
  }
  if (from.id === to.id) {
    throw new DataError('conflict', to.path, t().data.sameTopic);
  }
  const src = (ext: string) => bundlePath(from, paper.stem, ext);
  const dst = (ext: string) => bundlePath(to, paper.stem, ext);
  let result: MoveResult;

  if (!(await exists(ctx, dst('.json')))) {
    for (const ext of ['.json', '.md', '.hlt'] as const) {
      await moveIfExists(ctx, src(ext), dst(ext));
    }
    await moveText(ctx, src('.txt'), dst('.txt'), true);
    result = 'moved';
  } else {
    const moving = await readJsonObject(ctx, src('.json'));
    const existing = await readJsonObject(ctx, dst('.json'));
    if (addedTime(moving) > addedTime(existing)) {
      await ctx.writer.removeFile(dst('.json'));
      await ctx.writer.move(src('.json'), dst('.json'));
      // .md는 수정 시각이 더 최신인 쪽을 남기고, .hlt는 남은 .md와 짝을 맞춘다.
      let movedSummary = false;
      if (await exists(ctx, src('.md'))) {
        const srcTime = (await ctx.fs.stat(src('.md'))).mtimeMs;
        const dstTime = (await exists(ctx, dst('.md'))) ? (await ctx.fs.stat(dst('.md'))).mtimeMs : -Infinity;
        if (srcTime > dstTime) {
          await removeIfExists(ctx, dst('.md'));
          await ctx.writer.move(src('.md'), dst('.md'));
          movedSummary = true;
        } else {
          await ctx.writer.removeFile(src('.md'));
        }
      }
      if (movedSummary) {
        await removeIfExists(ctx, dst('.hlt'));
        await moveIfExists(ctx, src('.hlt'), dst('.hlt'));
      } else {
        await removeIfExists(ctx, src('.hlt'));
      }
      await moveText(ctx, src('.txt'), dst('.txt'), true);
      result = 'replaced';
    } else {
      for (const ext of ['.json', '.md', '.hlt'] as const) {
        await removeIfExists(ctx, src(ext));
      }
      await moveText(ctx, src('.txt'), dst('.txt'), false);
      result = 'keptTarget';
    }
  }
  for (const ext of BACKUP_EXTS) {
    await removeIfExists(ctx, src(ext));
  }
  return result;
}

/**
 * 전문 텍스트(.txt)를 옮긴다. manual 논문에서는 유일한 원본이므로 원본 주제에 남기지 않는다.
 * replace가 false이고 대상에 이미 있으면 원본을 지운다.
 */
async function moveText(ctx: DataOpsContext, from: string, to: string, replace: boolean): Promise<void> {
  if (!(await exists(ctx, from))) {
    return;
  }
  if (await exists(ctx, to)) {
    if (!replace) {
      await ctx.writer.removeFile(from);
      return;
    }
    await ctx.writer.removeFile(to);
  }
  await ctx.writer.move(from, to);
}

/** 논문 번들(.json, .md, .hlt, .txt)을 지운다. 없는 파일은 무시하고, 백업 파일은 남긴다 (형식 명세 §9.4). */
export async function deletePaper(ctx: DataOpsContext, paper: Paper, topic: Topic): Promise<void> {
  for (const ext of BUNDLE_EXTS) {
    await removeIfExists(ctx, bundlePath(topic, paper.stem, ext));
  }
}

/**
 * 요약(.md)을 저장한다. 기존 파일은 백업 없이 덮어쓴다 (DEV-PLAN §2.8).
 * 그사이 .json이 사라졌으면(다른 앱이 옮기거나 지움) 고아 파일을 만들지 않도록 conflict (§6.7).
 */
export async function writeSummary(ctx: DataOpsContext, paper: Paper, topic: Topic, markdown: string): Promise<void> {
  if (!(await paperExists(ctx, topic, paper.stem))) {
    throw new DataError('conflict', bundlePath(topic, paper.stem, '.json'), t().data.metaVanished);
  }
  await ctx.writer.writeTextAtomic(bundlePath(topic, paper.stem, '.md'), markdown);
}

/** 요약(.md)과 하이라이트(.hlt)를 지운다. 백업을 만들지 않는다 (DEV-PLAN §2.8). .json과 .txt는 그대로다. */
export async function deleteSummary(ctx: DataOpsContext, paper: Paper, topic: Topic): Promise<void> {
  await removeIfExists(ctx, bundlePath(topic, paper.stem, '.md'));
  await removeIfExists(ctx, bundlePath(topic, paper.stem, '.hlt'));
}
