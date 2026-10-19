// LLM 호출 공용: 오류 타입, 스트림 줄 읽기, 오류 응답 해석. vscode 비의존.
import type { FetchFn } from '../sources/arxiv';

export interface StreamOptions {
  fetch: FetchFn;
  signal?: AbortSignal;
}

/** LLM이 거부했거나 응답이 잘못됐다. 메시지는 사용자에게 그대로 보인다. */
export class LlmError extends Error {
  override name = 'LlmError';
}

/** 응답 본문을 줄 단위로 읽는다 (SSE, NDJSON 공통). 마지막 줄바꿈이 없는 줄도 돌려준다. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      yield* lines;
    }
    buffer += decoder.decode();
    if (buffer !== '') {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

/** HTTP 오류 응답에서 사람이 읽을 메시지를 뽑는다 ({ error: { message } } 또는 { error: "..." }). */
export async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const data = JSON.parse(text) as { error?: string | { message?: string } };
    const msg = typeof data.error === 'string' ? data.error : data.error?.message;
    if (msg) {
      return msg;
    }
  } catch {
    // JSON이 아니면 본문 앞부분을 그대로 쓴다.
  }
  return text.slice(0, 300) || `HTTP ${res.status}`;
}
