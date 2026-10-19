// paperId(논문 파일 이름)와 텍스트 정리 규칙 (형식 명세 §7.1, §8.1). vscode 비의존.

/** 제목 → paperId. 소문자로 바꾸고, 영숫자가 아닌 문자열을 '_' 하나로 바꾸고, 앞뒤 '_'를 지운다. */
export function slugifyPaperTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** 사용자가 직접 입력한 paperId가 slug 형식인지 (비어 있지 않고 slugify해도 그대로) */
export function isValidPaperId(id: string): boolean {
  return id !== '' && slugifyPaperTitle(id) === id;
}

/** 제목·저자 공백 정리: 연속 공백을 하나로, 앞뒤 공백 제거 */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
