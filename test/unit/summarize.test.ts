import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataWriter } from '../../src/data/dataWriter';
import type { Paper, Topic } from '../../src/data/models';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import type { DataOpsContext } from '../../src/data/topicOps';
import type { LlmSettings } from '../../src/llm/engine';
import { buildPrompt, readPromptTemplate, summarizePaper, type SummarizeOptions } from '../../src/llm/summarize';
import type { FetchFn } from '../../src/sources/arxiv';
import { copyFixture, putFile, removeTempFile, type TempData } from './tempData';

const OLLAMA: LlmSettings = { engine: 'ollama', geminiModel: 'g', ollamaUrl: 'http://ollama', ollamaModel: 'm' };

/** /api/generate는 NDJSON으로, 그 밖(PDF)은 PDF 바이트로 응답하는 가짜 fetch. 받은 프롬프트를 기록한다. */
function fakeNetwork(answer: string[] | Error) {
  const prompts: string[] = [];
  const fetch = vi.fn<FetchFn>(async (url, init) => {
    if (String(url).endsWith('/api/generate')) {
      prompts.push(JSON.parse(String(init?.body)).prompt);
      if (answer instanceof Error) {
        return new Response(JSON.stringify({ error: answer.message }) + '\n');
      }
      const lines = answer.map((t) => JSON.stringify({ response: t })).concat(JSON.stringify({ response: '', done: true }));
      return new Response(lines.join('\n') + '\n');
    }
    return new Response(new TextEncoder().encode('%PDF-1.7 fake'));
  });
  return { fetch, prompts };
}

let data: TempData;
let ctx: DataOpsContext;
const at = (...p: string[]) => path.join(data.root, ...p);
const topic = (): Topic => ({ id: 'Few-Shot_Learning', label: 'Few-Shot Learning', path: at('Few-Shot_Learning') });
// json만 있고 md는 없는 논문 (source 없음 → arxiv)
const STEM = 'domain_agnostic_few_shot_classification_by_learning_disparate_modulators';
const paper = (): Paper => ({ id: `Few-Shot_Learning/${STEM}`, topicId: 'Few-Shot_Learning', stem: STEM, meta: { title: STEM, authors: '' }, jsonPath: at('Few-Shot_Learning', `${STEM}.json`) });
const options = (fetch: FetchFn, over: Partial<SummarizeOptions> = {}): SummarizeOptions => ({
  settings: OLLAMA,
  fetch,
  extract: async () => 'FULL TEXT with $& and $1',
  ...over,
});

beforeEach(() => {
  data = copyFixture();
  ctx = { root: data.root, fs: nodeReadonlyFs, writer: createDataWriter({ root: data.root, isEnabled: () => true }) };
  putFile(data, 'userprompt.txt', 'Summarize in Korean.\n\n{context}\n\n(end {context})');
});
afterEach(() => data.cleanup());

describe('프롬프트', () => {
  it('첫 번째 {context}만 바꾸고, 본문의 $ 패턴을 그대로 넣는다', () => {
    expect(buildPrompt('A {context} B {context}', 'x $& $1 $$')).toBe('A x $& $1 $$ B {context}');
  });

  it('userprompt.txt가 없거나 {context}가 없으면 알린다', async () => {
    removeTempFile(data, 'userprompt.txt');
    await expect(readPromptTemplate(ctx)).rejects.toThrow(/userprompt\.txt이 없습니다/);
    putFile(data, 'userprompt.txt', 'no placeholder');
    await expect(readPromptTemplate(ctx)).rejects.toThrow(/\{context\}가 없습니다/);
  });
});

describe('summarizePaper (임시 복사본)', () => {
  it('PDF → .txt → LLM → .md 순서로 만들고 진행 상황을 알린다', async () => {
    const { fetch, prompts } = fakeNetwork(['# 요약', '\n\n본문']);
    const stages: string[] = [];
    const result = await summarizePaper(ctx, topic(), paper(), options(fetch, { onProgress: (s, n) => stages.push(n === undefined ? s : `${s}:${n}`) }));

    expect(result).toEqual({ chars: '# 요약\n\n본문'.length, downloaded: true });
    expect(readFileSync(at('Few-Shot_Learning', `${STEM}.md`), 'utf8')).toBe('# 요약\n\n본문');
    expect(readFileSync(at('Few-Shot_Learning', `${STEM}.txt`), 'utf8')).toBe('FULL TEXT with $& and $1');
    expect(prompts[0]).toBe('Summarize in Korean.\n\nFULL TEXT with $& and $1\n\n(end {context})');
    expect(String(fetch.mock.calls[0][0])).toMatch(/^http:\/\/arxiv\.org\/pdf\//);
    expect(stages).toEqual(['text', 'generate:0', 'generate:4', 'generate:8']);
  });

  it('기존 요약은 백업 없이 덮어쓴다', async () => {
    putFile(data, `Few-Shot_Learning/${STEM}.md`, '# old');
    await summarizePaper(ctx, topic(), paper(), options(fakeNetwork(['# new']).fetch));
    expect(readFileSync(at('Few-Shot_Learning', `${STEM}.md`), 'utf8')).toBe('# new');
    expect(existsSync(at('Few-Shot_Learning', `${STEM}.bak`))).toBe(false);
  });

  it('LLM 오류나 빈 응답이면 .md를 만들지 않는다 (.txt는 남는다)', async () => {
    await expect(summarizePaper(ctx, topic(), paper(), options(fakeNetwork(new Error('model not found')).fetch))).rejects.toThrow(/model not found/);
    await expect(summarizePaper(ctx, topic(), paper(), options(fakeNetwork(['  ']).fetch))).rejects.toThrow(/비어 있습니다/);
    expect(existsSync(at('Few-Shot_Learning', `${STEM}.md`))).toBe(false);
    expect(existsSync(at('Few-Shot_Learning', `${STEM}.txt`))).toBe(true);
  });

  it('취소하면 .md를 만들지 않는다', async () => {
    const controller = new AbortController();
    const { fetch } = fakeNetwork(['# 요약']);
    await expect(
      summarizePaper(ctx, topic(), paper(), options(fetch, { signal: controller.signal, onProgress: (s) => s === 'generate' && controller.abort() })),
    ).rejects.toThrow();
    expect(existsSync(at('Few-Shot_Learning', `${STEM}.md`))).toBe(false);
  });

  it('응답을 받는 사이 .json이 사라지면 고아 .md를 만들지 않는다 (conflict)', async () => {
    const { fetch } = fakeNetwork(['# 요약']);
    const removeJson = () => removeTempFile(data, `Few-Shot_Learning/${STEM}.json`);
    await expect(summarizePaper(ctx, topic(), paper(), options(fetch, { onProgress: (s, n) => s === 'generate' && n === 0 && removeJson() }))).rejects.toMatchObject({
      kind: 'conflict',
    });
    expect(existsSync(at('Few-Shot_Learning', `${STEM}.md`))).toBe(false);
  });
});
