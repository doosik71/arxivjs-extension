import { describe, expect, it, vi } from 'vitest';
import { errorDetail, LlmError, readLines } from '../../src/llm/common';
import { checkLlmSettings, describeEngine, streamGenerate, type LlmSettings } from '../../src/llm/engine';
import { GEMINI_API, streamGemini } from '../../src/llm/gemini';
import { streamOllama } from '../../src/llm/ollama';
import type { FetchFn } from '../../src/sources/arxiv';

/** 조각(chunk)으로 나뉘어 도착하는 응답 본문 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(enc.encode(c));
      }
      controller.close();
    },
  });
}

const respond = (chunks: string[], status = 200) => vi.fn<FetchFn>(async () => new Response(streamOf(chunks), { status }));

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const s of gen) {
    out.push(s);
  }
  return out;
}

const GEMINI: LlmSettings = { engine: 'gemini', geminiModel: 'gemini-2.5-flash', geminiApiKey: 'SECRET', ollamaUrl: 'http://localhost:11434', ollamaModel: '' };
const OLLAMA: LlmSettings = { ...GEMINI, engine: 'ollama', geminiApiKey: undefined, ollamaModel: 'gemma4:31b' };

describe('readLines', () => {
  it('조각 경계와 CRLF, 끝 줄바꿈 없는 마지막 줄, 쪼개진 UTF-8을 처리한다', async () => {
    const bytes = new TextEncoder().encode('한글');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('a\r\nb'));
        c.enqueue(new TextEncoder().encode('c\n\n'));
        c.enqueue(bytes.slice(0, 2)); // '한'의 앞 2바이트
        c.enqueue(bytes.slice(2));
        c.close();
      },
    });
    expect(await collect(readLines(body))).toEqual(['a', 'bc', '', '한글']);
  });
});

describe('errorDetail', () => {
  it('{ error: { message } }, { error: "..." }, 그 밖의 본문', async () => {
    expect(await errorDetail(new Response('{"error":{"code":400,"message":"API key not valid"}}', { status: 400 }))).toBe('API key not valid');
    expect(await errorDetail(new Response('{"error":"model not found"}', { status: 404 }))).toBe('model not found');
    expect(await errorDetail(new Response('Bad Gateway', { status: 502 }))).toBe('Bad Gateway');
    expect(await errorDetail(new Response('', { status: 500 }))).toBe('HTTP 500');
  });
});

describe('checkLlmSettings / describeEngine', () => {
  it('엔진별로 빠진 값을 알려 준다', () => {
    expect(checkLlmSettings(GEMINI)).toBeUndefined();
    expect(checkLlmSettings({ ...GEMINI, geminiApiKey: undefined })).toContain('API key');
    expect(checkLlmSettings(OLLAMA)).toBeUndefined();
    expect(checkLlmSettings({ ...OLLAMA, ollamaModel: ' ' })).toContain('ollama.model');
    expect(checkLlmSettings({ ...OLLAMA, ollamaUrl: 'localhost:11434' })).toContain('ollama.url');
    expect(describeEngine(GEMINI)).toBe('Gemini gemini-2.5-flash');
  });
});

describe('streamGemini', () => {
  const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\r\n\r\n`;
  const textChunk = (text: string, finishReason?: string) => sse({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

  it('SSE 조각의 텍스트를 차례로 돌려주고, 키는 URL이 아니라 헤더로 보낸다', async () => {
    const fetch = respond([textChunk('# 제목'), textChunk('\n본문'), sse({ candidates: [{ content: { parts: [{ text: '생각', thought: true }] } }] }), textChunk('', 'STOP')]);
    const out = await collect(streamGemini({ apiKey: 'SECRET', model: 'gemini-2.5-flash' }, 'PROMPT', { fetch }));
    expect(out.join('')).toBe('# 제목\n본문');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${GEMINI_API}/models/gemini-2.5-flash:streamGenerateContent?alt=sse`);
    expect(String(url)).not.toContain('SECRET');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET');
    expect(JSON.parse(String(init?.body))).toEqual({ contents: [{ role: 'user', parts: [{ text: 'PROMPT' }] }] });
  });

  it('HTTP 오류, 요청 거부, 중단된 응답은 LlmError', async () => {
    const http = vi.fn<FetchFn>(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }));
    await expect(collect(streamGemini({ apiKey: 'x', model: 'm' }, 'p', { fetch: http }))).rejects.toThrow(/HTTP 400.*API key not valid/);

    const blocked = respond([sse({ promptFeedback: { blockReason: 'SAFETY' } })]);
    await expect(collect(streamGemini({ apiKey: 'x', model: 'm' }, 'p', { fetch: blocked }))).rejects.toThrow(LlmError);

    const stopped = respond([textChunk('부분', 'RECITATION')]);
    await expect(collect(streamGemini({ apiKey: 'x', model: 'm' }, 'p', { fetch: stopped }))).rejects.toThrow(/RECITATION/);
  });
});

describe('streamOllama', () => {
  const line = (obj: unknown) => `${JSON.stringify(obj)}\n`;

  it('NDJSON 조각을 이어 붙이고 /api/generate로 보낸다', async () => {
    const fetch = respond([line({ response: '# 요' }), line({ response: '약' }).slice(0, 5), line({ response: '약' }).slice(5), line({ response: '', done: true })]);
    const out = await collect(streamOllama({ url: 'http://localhost:11434/', model: 'gemma4:31b' }, 'PROMPT', { fetch }));
    expect(out.join('')).toBe('# 요약');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'gemma4:31b', prompt: 'PROMPT', stream: true });
  });

  it('오류 줄, 끝(done) 없이 끊긴 응답, 연결 실패는 LlmError', async () => {
    await expect(collect(streamOllama({ url: 'http://h', model: 'm' }, 'p', { fetch: respond([line({ error: 'out of memory' })]) }))).rejects.toThrow(/out of memory/);
    await expect(collect(streamOllama({ url: 'http://h', model: 'm' }, 'p', { fetch: respond([line({ response: 'a' })]) }))).rejects.toThrow(/connection closed/);
    const refused = vi.fn<FetchFn>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(collect(streamOllama({ url: 'http://h', model: 'm' }, 'p', { fetch: refused }))).rejects.toThrow(/Could not connect/);
  });
});

describe('streamGenerate', () => {
  it('설정한 엔진으로 보낸다', async () => {
    const fetch = respond([JSON.stringify({ response: 'ok', done: true })]);
    expect((await collect(streamGenerate(OLLAMA, 'p', { fetch }))).join('')).toBe('ok');
    expect(String(fetch.mock.calls[0][0])).toContain('/api/generate');
  });
});
