// 논문 요약 생성 (DEV-PLAN §8.3, 형식 명세 §9.2. 단 .bak 백업은 만들지 않는다). vscode 비의존.
import * as path from 'node:path';
import { DataError, isNotFound } from '../data/errors';
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

/**
 * 데이터 폴더에 userprompt.txt가 없을 때 새로 만드는 기본 프롬프트.
 * arxivjs 앱의 prompt.json "summarization" 프롬프트에 {context}를 붙였다. 요약 문서 구조(형식 명세 §8.2)가 같다.
 */
export const DEFAULT_PROMPT = `Please summarize the following paper.

The summary **must be written in Korean** and **must follow Markdown syntax** using a clear hierarchical structure with headings, bullet points, and formatting where appropriate.
Ensure the content is **concise, accurate, and easy to understand** for a technical but general audience.

Please follow these formatting rules:

- At the very top, display:
  - The **paper title** on the first line as a '#' heading.
  - The **author list** on the second line as plain text (comma-separated), below the title.

- Then use the following summary structure:
  - ## 🧩 Problem to Solve
    - Clearly describe the main research problem or question the paper aims to address.
  - ## ✨ Key Contributions
    - List the core findings and novel contributions as bullet points.
  - ## 📎 Related Works
    - Mention key prior works referenced in the paper.
  - ## 🛠️ Methodology
    - Describe the approach or algorithm used, preferably with steps or bullet points.
  - ## 📊 Results
    - Summarize quantitative or qualitative results briefly.
  - ## 🧠 Insights & Discussion
    - Explain the implications, any limitations, or significance of the results.
  - ## 📌 TL;DR
    - Provide a TL;DR summary of this paper, highlighting the main problem, proposed method, and key findings.

- Guidelines for writing in Markdown format:
  1. Use braces around multi-character subscripts or superscripts in MathJax to avoid rendering errors.
  2. Use $...$ for inline math and $$...$$ for block math to ensure compatibility with MathJax.
  3. Do not use backticks (\`) for math; use dollar signs ($) to allow proper MathJax rendering.

Here is the paper content:

${PLACEHOLDER}
`;

/** userprompt.txt가 없거나 {context}가 없다. 알림에서 프롬프트 파일을 여는 버튼을 보여 준다. */
export class PromptFileError extends LlmError {
  override name = 'PromptFileError';
}

/** 데이터 폴더의 userprompt.txt 절대 경로 */
export function promptFilePath(ctx: DataOpsContext): string {
  return path.join(ctx.root, PROMPT_FILE);
}

/** userprompt.txt가 있는가 */
export async function promptFileExists(ctx: DataOpsContext): Promise<boolean> {
  try {
    await ctx.fs.stat(promptFilePath(ctx));
    return true;
  } catch (err) {
    if (isNotFound(err)) {
      return false;
    }
    throw err;
  }
}

/** 기본 프롬프트로 userprompt.txt를 만든다. 그사이 다른 앱이 만들었으면 덮어쓰지 않고 conflict */
export async function createDefaultPrompt(ctx: DataOpsContext): Promise<void> {
  if (await promptFileExists(ctx)) {
    throw new DataError('conflict', promptFilePath(ctx), t().llm.promptExists(PROMPT_FILE));
  }
  await ctx.writer.writeTextAtomic(promptFilePath(ctx), DEFAULT_PROMPT);
}

/** 데이터 폴더의 userprompt.txt. 없거나 {context}가 없으면 PromptFileError */
export async function readPromptTemplate(ctx: DataOpsContext): Promise<string> {
  let template: string;
  try {
    template = await ctx.fs.readText(promptFilePath(ctx));
  } catch (err) {
    if (isNotFound(err)) {
      throw new PromptFileError(t().llm.promptMissing(PROMPT_FILE, PLACEHOLDER));
    }
    throw err;
  }
  if (!template.includes(PLACEHOLDER)) {
    throw new PromptFileError(t().llm.placeholderMissing(PROMPT_FILE, PLACEHOLDER));
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
