// LLM 엔진 공통 (DEV-PLAN §8.1). vscode 비의존. SDK 없이 REST를 직접 부른다.
import { t } from '../i18n';
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
      return t().llm.noGeminiKey;
    }
    if (!s.geminiModel.trim()) {
      return t().llm.geminiModelEmpty;
    }
    return undefined;
  }
  if (!/^https?:\/\/\S+$/.test(s.ollamaUrl.trim())) {
    return t().llm.ollamaUrlInvalid;
  }
  if (!s.ollamaModel.trim()) {
    return t().llm.ollamaModelEmpty;
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
