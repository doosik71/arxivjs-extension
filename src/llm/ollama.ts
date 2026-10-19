// Ollama REST (/api/generate, NDJSON 스트림). 키를 쓰지 않는다.
import { errorDetail, LlmError, readLines, type StreamOptions } from './common';

interface OllamaChunk {
  response?: string;
  done?: boolean;
  error?: string;
}

export async function* streamOllama(config: { url: string; model: string }, prompt: string, options: StreamOptions): AsyncGenerator<string> {
  const base = config.url.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await options.fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, prompt, stream: true }),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }
    throw new LlmError(`Ollama 서버(${base})에 연결하지 못했습니다. Ollama가 실행 중인지 확인하세요.`);
  }
  if (!res.ok || !res.body) {
    throw new LlmError(`Ollama 요청 실패 (HTTP ${res.status}): ${await errorDetail(res)}`);
  }
  let done = false;
  for await (const line of readLines(res.body)) {
    if (line.trim() === '') {
      continue;
    }
    const chunk = JSON.parse(line) as OllamaChunk;
    if (chunk.error) {
      throw new LlmError(`Ollama 오류: ${chunk.error}`);
    }
    if (chunk.response) {
      yield chunk.response;
    }
    done ||= chunk.done === true;
  }
  if (!done) {
    throw new LlmError('Ollama 응답이 끝나기 전에 연결이 끊겼습니다.');
  }
}
