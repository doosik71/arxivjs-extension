// LLM 엔진 공통 (DEV-PLAN §8.1). vscode 비의존. Gemini·Ollama는 REST를 직접, Claude는 공식 SDK로 부른다.
import { t } from '../i18n';
import { streamClaude } from './claude';
import type { StreamOptions } from './common';
import { streamGemini } from './gemini';
import { streamOllama } from './ollama';

export type LlmEngineName = 'gemini' | 'ollama' | 'claude';

export interface LlmSettings {
  engine: LlmEngineName;
  geminiModel: string;
  /** SecretStorage에서 읽은 키. 없으면 undefined */
  geminiApiKey?: string;
  ollamaUrl: string;
  ollamaModel: string;
  claudeModel: string;
  /** SecretStorage에서 읽은 키. 없으면 undefined */
  claudeApiKey?: string;
  /** anthropic-workspace-id 헤더. 비었으면 보내지 않는다. */
  claudeWorkspaceId: string;
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
  if (s.engine === 'claude') {
    if (!s.claudeApiKey) {
      return t().llm.noClaudeKey;
    }
    if (!s.claudeModel.trim()) {
      return t().llm.claudeModelEmpty;
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
  switch (s.engine) {
    case 'gemini':
      return `Gemini ${s.geminiModel}`;
    case 'claude':
      return `Claude ${s.claudeModel}`;
    default:
      return `Ollama ${s.ollamaModel}`;
  }
}

/** 프롬프트를 보내고 응답 텍스트 조각을 차례로 돌려준다. */
export function streamGenerate(s: LlmSettings, prompt: string, options: StreamOptions): AsyncGenerator<string> {
  switch (s.engine) {
    case 'gemini':
      return streamGemini({ apiKey: s.geminiApiKey ?? '', model: s.geminiModel.trim() }, prompt, options);
    case 'claude':
      return streamClaude(
        { apiKey: s.claudeApiKey ?? '', model: s.claudeModel.trim(), workspaceId: s.claudeWorkspaceId.trim() || undefined },
        prompt,
        options,
      );
    default:
      return streamOllama({ url: s.ollamaUrl.trim(), model: s.ollamaModel.trim() }, prompt, options);
  }
}
