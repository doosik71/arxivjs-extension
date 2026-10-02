/** 주제 = 데이터 폴더의 하위 폴더 하나 */
export interface Topic {
  /** 폴더 이름 (예: "Few-Shot_Learning") */
  id: string;
  /** 표시 이름 (예: "Few-Shot Learning") */
  label: string;
  /** 폴더 절대 경로 */
  path: string;
}

/** 논문 메타 정보 (json 파일 내용) */
export interface PaperMeta {
  title: string;
  /** 쉼표로 구분한 저자 문자열. 원본 그대로 둔다. */
  authors: string;
  year?: number;
  url?: string;
  abstract?: string;
  citation?: number;
  /** 'arxiv' | 'pdf' | 'manual' (알 수 없는 값도 그대로 둔다) */
  source?: string;
}

/** 논문 = 같은 stem을 공유하는 .json / .md 쌍 */
export interface Paper {
  /** `${topicId}/${stem}` */
  id: string;
  topicId: string;
  /** 확장자를 뺀 파일 이름 */
  stem: string;
  meta: PaperMeta;
  jsonPath?: string;
  mdPath?: string;
  /** json 파싱 실패 사유. 있으면 meta는 md 또는 파일 이름에서 추정한 값이다. */
  metaError?: string;
}

export type PaperSort = 'citation' | 'year' | 'title';
