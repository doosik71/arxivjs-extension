// UI 표시 언어 (설정 arxivjs.language). vscode 비의존.
// 언어는 활성화할 때 한 번 정한다. 설정을 바꾸면 창을 다시 로드해야 적용된다.
import { en, type Messages } from './en';
import { ko } from './ko';

export type { Messages } from './en';
export type Language = 'en' | 'ko';

const CATALOGS: Record<Language, Messages> = { en, ko };

let current: Language = 'en';

/**
 * 설정값 → 표시 언어. 'auto'는 VS Code 표시 언어(vscode.env.language)를 따른다.
 * 알 수 없는 값은 기본값 영어.
 */
export function resolveLanguage(setting: unknown, uiLanguage: string): Language {
  if (setting === 'en' || setting === 'ko') {
    return setting;
  }
  if (setting === 'auto') {
    return uiLanguage.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  return 'en';
}

export function setLanguage(language: Language): void {
  current = language;
}

export function currentLanguage(): Language {
  return current;
}

/** 현재 언어의 UI 문자열 */
export function t(): Messages {
  return CATALOGS[current];
}

/** 특정 언어의 UI 문자열 (언어를 바꾼 직후 안내용) */
export function messagesFor(language: Language): Messages {
  return CATALOGS[language];
}

/** "{name}" 자리표시자를 바꾼다. webview 스크립트(media/*.js)에도 같은 규칙이 있다. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
