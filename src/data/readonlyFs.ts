// 데이터 폴더에 접근하는 유일한 모듈 (DEV-PLAN §7).
// 읽기 API(readFile, readdir, stat)만 쓴다. 쓰기 API는 eslint.config.mjs가 막는다.
import { readFile, readdir, stat } from 'node:fs/promises';
import { DataError, type DataErrorKind } from './errors';

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStat {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtimeMs: number;
}

/** 데이터 계층이 의존하는 읽기 전용 파일 시스템 */
export interface ReadonlyFileSystem {
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  stat(path: string): Promise<FileStat>;
}

function toDataError(err: unknown, path: string): DataError {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const kind: DataErrorKind = code === 'ENOENT' ? 'notFound' : code === 'ENOTDIR' ? 'notDirectory' : 'io';
  const reason = err instanceof Error ? err.message : String(err);
  return new DataError(kind, path, reason, { cause: err });
}

async function wrap<T>(path: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    throw toDataError(err, path);
  }
}

/** node:fs/promises 기반 구현 */
export const nodeReadonlyFs: ReadonlyFileSystem = {
  readText: (path) => wrap(path, () => readFile(path, { encoding: 'utf8' })),

  readDir: (path) =>
    wrap(path, async () => {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
    }),

  stat: (path) =>
    wrap(path, async () => {
      const s = await stat(path);
      return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size, mtimeMs: s.mtimeMs };
    }),
};
