// Gemini REST (streamGenerateContent, SSE). 키는 URL이 아니라 x-goog-api-key 헤더로 보낸다 (DEV-PLAN §8.2).
import { t } from '../i18n';
import { errorDetail, LlmError, readLines, type StreamOptions } from './common';

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/** 응답을 정상으로 보는 종료 이유. 그 밖(SAFETY, RECITATION 등)은 중단된 것으로 본다. */
const OK_FINISH = new Set(['STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED']);

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export async function* streamGemini(
  config: { apiKey: string; model: string },
  prompt: string,
  options: StreamOptions,
): AsyncGenerator<string> {
  const url = `${GEMINI_API}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`;
  const res = await options.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    throw new LlmError(t().llm.geminiHttp(res.status, await errorDetail(res)));
  }
  for await (const line of readLines(res.body)) {
    if (!line.startsWith('data:')) {
      continue;
    }
    const chunk = JSON.parse(line.slice(5)) as GeminiChunk;
    if (chunk.error) {
      throw new LlmError(t().llm.geminiError(chunk.error.message ?? t().llm.unknown));
    }
    if (chunk.promptFeedback?.blockReason) {
      throw new LlmError(t().llm.geminiBlocked(chunk.promptFeedback.blockReason));
    }
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.text && !part.thought) {
        yield part.text;
      }
    }
    if (candidate?.finishReason && !OK_FINISH.has(candidate.finishReason)) {
      throw new LlmError(t().llm.geminiStopped(candidate.finishReason));
    }
  }
}
