/** 주제 표시 이름에 허용하는 문자: 영문, 숫자, 한글 완성형, 공백, 괄호, 하이픈 (DEV-PLAN §2.2, 형식 명세 §6.2) */
export const TOPIC_NAME_PATTERN = /^[a-zA-Z0-9가-힣 ()-]+$/;

export function isValidTopicName(folderName: string): boolean {
  return TOPIC_NAME_PATTERN.test(toDisplayName(folderName));
}

/** 표시 이름: 언더스코어를 공백으로 바꾸고, 연속 공백을 하나로 줄인 뒤 앞뒤 공백을 지운다. 하이픈은 그대로 둔다. */
export function toDisplayName(folderName: string): string {
  return folderName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 새로 만들 폴더 이름: 표시 이름을 정규화한 뒤 공백을 언더스코어로 바꾼다 (형식 명세 §6.1). */
export function toTopicFolderName(displayName: string): string {
  return toDisplayName(displayName).replace(/ /g, '_');
}
