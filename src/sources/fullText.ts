// 논문 전문 텍스트 (DEV-PLAN §8.3, 형식 명세 §8.3). vscode 비의존.
// .txt 캐시 → 없으면 source에 따라 PDF를 내려받아 텍스트를 뽑고 .txt로 저장한다. PDF 원본은 저장하지 않는다.
import * as path from 'node:path';
import { isNotFound } from '../data/errors';
import { t } from '../i18n';
import type { Paper, PaperMeta, Topic } from '../data/models';
import type { DataOpsContext } from '../data/topicOps';
import type { FetchFn } from './arxiv';

/** PDF 바이트 → 텍스트 (확장은 dist/pdfText.js, 테스트는 가짜를 넘긴다) */
export type PdfTextExtractor = (data: Uint8Array) => Promise<string>;

/** 전문을 얻지 못한 이유. 메시지는 사용자에게 그대로 보인다. */
export class FullTextError extends Error {
  override name = 'FullTextError';
}

const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

/** source에 따라 PDF URL을 정한다. arxiv(또는 source 없음)는 abs → pdf, pdf는 그대로, manual은 없다. */
export function pdfUrlFor(meta: PaperMeta): string | undefined {
  const source = meta.source === 'pdf' || meta.source === 'manual' ? meta.source : 'arxiv';
  if (source === 'manual' || !meta.url) {
    return undefined;
  }
  return source === 'arxiv' ? meta.url.replace('/abs/', '/pdf/') : meta.url;
}

/** PDF를 내려받는다. PDF가 아니거나 너무 크면 FullTextError */
export async function downloadPdf(url: string, options: { fetch: FetchFn; signal?: AbortSignal }): Promise<Uint8Array> {
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const res = await options.fetch(url, { signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
  if (!res.ok) {
    throw new FullTextError(t().fullText.downloadFailed(res.status, url));
  }
  const length = Number(res.headers.get('content-length'));
  if (length > MAX_PDF_BYTES) {
    throw new FullTextError(t().fullText.tooLargeMb(Math.round(length / 1024 / 1024), url));
  }
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new FullTextError(t().fullText.tooLarge(url));
  }
  if (new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') {
    throw new FullTextError(t().fullText.notPdf(res.headers.get('content-type') ?? t().fullText.unknownType, url));
  }
  return data;
}

export interface FullTextResult {
  text: string;
  /** .txt 캐시를 썼는가 (false이면 PDF를 내려받아 새로 만들었다) */
  fromCache: boolean;
}

export interface FullTextOptions {
  fetch: FetchFn;
  extract: PdfTextExtractor;
  signal?: AbortSignal;
}

/** 논문의 전문 텍스트. 캐시가 없으면 PDF에서 만들어 <paperId>.txt로 저장한다. */
export async function getFullText(ctx: DataOpsContext, topic: Topic, paper: Paper, meta: PaperMeta, options: FullTextOptions): Promise<FullTextResult> {
  const txtPath = path.join(topic.path, `${paper.stem}.txt`);
  try {
    const cached = await ctx.fs.readText(txtPath);
    if (cached.trim() !== '') {
      return { text: cached, fromCache: true }; // 빈 파일은 없는 것으로 본다.
    }
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  const url = pdfUrlFor(meta);
  if (!url) {
    throw new FullTextError(
      meta.source === 'manual'
        ? t().fullText.manualNeedsTxt
        : t().fullText.noUrl,
    );
  }
  const data = await downloadPdf(url, options);
  let text: string;
  try {
    text = await options.extract(data);
  } catch (err) {
    throw new FullTextError(t().fullText.extractFailed(err instanceof Error ? err.message : String(err)));
  }
  if (text.trim() === '') {
    throw new FullTextError(t().fullText.noText);
  }
  await ctx.writer.writeTextAtomic(txtPath, text);
  return { text, fromCache: false };
}
