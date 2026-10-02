export type DataErrorKind = 'notFound' | 'notDirectory' | 'io';

/** 데이터 폴더 읽기 오류 */
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
