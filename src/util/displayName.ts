/** 주제 폴더 이름 규칙: 영숫자, 언더스코어, 하이픈 (DEV-PLAN §2.2) */
export const TOPIC_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidTopicName(folderName: string): boolean {
  return TOPIC_NAME_PATTERN.test(folderName);
}

/** 표시 이름: 언더스코어를 공백으로 바꾼다. 하이픈은 그대로 둔다. */
export function toDisplayName(folderName: string): string {
  return folderName.replace(/_/g, ' ');
}
