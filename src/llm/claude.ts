// Claude (Anthropic Messages API, 스트리밍). Gemini·Ollama와 달리 공식 SDK(@anthropic-ai/sdk)를 쓴다.
// fetch와 signal은 SDK에 그대로 넘겨 테스트의 가짜 fetch와 취소가 똑같이 동작하게 한다.
import Anthropic from '@anthropic-ai/sdk';
import { t } from '../i18n';
import { LlmError, type StreamOptions } from './common';

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  /** 워크스페이스에 묶이지 않은 API 키용. 비었으면 보내지 않는다. */
  workspaceId?: string;
}

/** API 오류 본문 { error: { message } }에서 메시지만 뽑는다. 없으면 SDK 메시지 */
function apiErrorDetail(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? err.message;
}

export async function* streamClaude(config: ClaudeConfig, prompt: string, options: StreamOptions): AsyncGenerator<string> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    fetch: options.fetch,
    defaultHeaders: config.workspaceId ? { 'anthropic-workspace-id': config.workspaceId } : undefined,
  });
  let stopReason: string | null;
  try {
    // 서버 측 대체 모델(fallback): 안전 분류기가 잘못 거부해도 다른 모델로 다시 돌려 요약을 끝낸다.
    const stream = client.beta.messages.stream(
      {
        model: config.model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: options.signal },
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    stopReason = (await stream.finalMessage()).stop_reason;
  } catch (err) {
    if (options.signal?.aborted || err instanceof LlmError) {
      throw err;
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new LlmError(t().llm.claudeConnect);
    }
    if (err instanceof Anthropic.APIError) {
      throw new LlmError(t().llm.claudeHttp(err.status ?? 0, apiErrorDetail(err)));
    }
    throw err;
  }
  // 잘렸거나 거부된 응답은 저장하지 않도록 오류로 끝낸다.
  if (stopReason === 'max_tokens') {
    throw new LlmError(t().llm.claudeTruncated);
  }
  if (stopReason === 'refusal') {
    throw new LlmError(t().llm.claudeRefused);
  }
}
