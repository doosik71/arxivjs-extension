// 논문 요약 생성 (DEV-PLAN §8.3, 형식 명세 §9.2. 단 .bak 백업은 만들지 않는다). vscode 비의존.
import * as path from 'node:path';
import { isNotFound } from '../data/errors';
import { t } from '../i18n';
import type { Paper, Topic } from '../data/models';
import { readPaperMeta, writeSummary } from '../data/paperOps';
import type { DataOpsContext } from '../data/topicOps';
import type { FetchFn } from '../sources/arxiv';
import { getFullText, type PdfTextExtractor } from '../sources/fullText';
import { LlmError } from './common';
import { streamGenerate, type LlmSettings } from './engine';

export const PROMPT_FILE = 'userprompt.txt';
const PLACEHOLDER = '{context}';

export type SummaryStage = 'text' | 'generate';

export interface SummarizeOptions {
  settings: LlmSettings;
  fetch: FetchFn;
  extract: PdfTextExtractor;
  signal?: AbortSignal;
  /** 진행 상황: 전문 준비 중(text), 응답 받는 중(generate, 지금까지 받은 글자 수) */
  onProgress?(stage: SummaryStage, chars?: number): void;
}

export interface SummarizeResult {
  /** 저장한 요약의 글자 수 */
  chars: number;
  /** PDF를 새로 내려받았는가 (일괄 요약에서 arXiv 요청 간격을 둘 때 쓴다) */
  downloaded: boolean;
}

/** 데이터 폴더의 userprompt.txt. 없거나 {context}가 없으면 LlmError */
export async function readPromptTemplate(ctx: DataOpsContext): Promise<string> {
  let template: string;
  try {
    template = await ctx.fs.readText(path.join(ctx.root, PROMPT_FILE));
  } catch (err) {
    if (isNotFound(err)) {
      throw new LlmError(t().llm.promptMissing(PROMPT_FILE, PLACEHOLDER));
    }
    throw err;
  }
  if (!template.includes(PLACEHOLDER)) {
    throw new LlmError(t().llm.placeholderMissing(PROMPT_FILE, PLACEHOLDER));
  }
  return template;
}

/** 첫 번째 {context}만 바꾼다 (형식 명세 §5). 본문의 $&, $1 같은 문자열을 그대로 넣으려고 함수로 바꾼다. */
export function buildPrompt(template: string, fullText: string): string {
  return template.replace(PLACEHOLDER, () => fullText);
}

/**
 * 논문 하나를 요약해 <paperId>.md로 저장한다.
 * 응답이 정상으로 끝났을 때만 저장한다. 실패하거나 취소하면 .md는 그대로다 (.txt는 이미 저장됐을 수 있다).
 */
export async function summarizePaper(ctx: DataOpsContext, topic: Topic, paper: Paper, options: SummarizeOptions): Promise<SummarizeResult> {
  const template = await readPromptTemplate(ctx);
  const meta = await readPaperMeta(ctx, paper);

  options.onProgress?.('text');
  const { text, fromCache } = await getFullText(ctx, topic, paper, meta, options);

  options.onProgress?.('generate', 0);
  let markdown = '';
  for await (const chunk of streamGenerate(options.settings, buildPrompt(template, text), options)) {
    markdown += chunk;
    options.onProgress?.('generate', markdown.length);
  }
  if (markdown.trim() === '') {
    throw new LlmError(t().llm.emptyResponse);
  }
  options.signal?.throwIfAborted();
  await writeSummary(ctx, paper, topic, markdown);
  return { chars: markdown.length, downloaded: !fromCache };
}
