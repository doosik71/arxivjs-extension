/**
 * - notFound / notDirectory / io: 읽기·쓰기 중 파일 시스템 오류
 * - conflict: 대상이 이미 있거나, 비어 있지 않거나, 그사이 다른 앱이 바꿨다
 * - writeDisabled: 설정 arxivjs.enableWrite가 꺼져 있다
 * - invalidPath: 쓰기 대상이 데이터 폴더 밖이다
 */
export type DataErrorKind = 'notFound' | 'notDirectory' | 'io' | 'conflict' | 'writeDisabled' | 'invalidPath';

/** 데이터 폴더 읽기·쓰기 오류 */
export class DataError extends Error {
  constructor(
    readonly kind: DataErrorKind,
    readonly path: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DataError';
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof DataError && err.kind === 'notFound';
}
