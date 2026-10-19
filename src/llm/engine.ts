// LLM 엔진 공통 (DEV-PLAN §8.1). vscode 비의존. SDK 없이 REST를 직접 부른다.
import type { StreamOptions } from './common';
import { streamGemini } from './gemini';
import { streamOllama } from './ollama';

export type LlmEngineName = 'gemini' | 'ollama';

export interface LlmSettings {
  engine: LlmEngineName;
  geminiModel: string;
  /** SecretStorage에서 읽은 키. 없으면 undefined */
  geminiApiKey?: string;
  ollamaUrl: string;
  ollamaModel: string;
}

/** 설정에 빠진 값이 있으면 그 이유. 없으면 undefined */
export function checkLlmSettings(s: LlmSettings): string | undefined {
  if (s.engine === 'gemini') {
    if (!s.geminiApiKey) {
      return 'Gemini API 키가 없습니다. 명령 "ArxivJS: Gemini API 키 설정"으로 넣으세요.';
    }
    if (!s.geminiModel.trim()) {
      return '설정 arxivjs.gemini.model이 비어 있습니다.';
    }
    return undefined;
  }
  if (!/^https?:\/\/\S+$/.test(s.ollamaUrl.trim())) {
    return '설정 arxivjs.ollama.url이 http(s) 주소가 아닙니다.';
  }
  if (!s.ollamaModel.trim()) {
    return '설정 arxivjs.ollama.model이 비어 있습니다 (예: gemma4:31b).';
  }
  return undefined;
}

/** 엔진 이름과 모델 (진행률 표시용) */
export function describeEngine(s: LlmSettings): string {
  return s.engine === 'gemini' ? `Gemini ${s.geminiModel}` : `Ollama ${s.ollamaModel}`;
}

/** 프롬프트를 보내고 응답 텍스트 조각을 차례로 돌려준다. */
export function streamGenerate(s: LlmSettings, prompt: string, options: StreamOptions): AsyncGenerator<string> {
  return s.engine === 'gemini'
    ? streamGemini({ apiKey: s.geminiApiKey ?? '', model: s.geminiModel.trim() }, prompt, options)
    : streamOllama({ url: s.ollamaUrl.trim(), model: s.ollamaModel.trim() }, prompt, options);
}
