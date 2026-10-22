// 데이터 폴더에 쓰는 유일한 모듈 (DEV-PLAN §7.1).
// 쓰기 API는 이 파일에서만 쓸 수 있다(eslint.config.mjs). 다른 모듈은 DataWriter 인터페이스만 쓴다.
//
// 이중 방어: 메뉴와 버튼은 설정 arxivjs.enableWrite가 꺼져 있으면 숨지만,
// 이 모듈도 호출될 때마다 설정을 다시 확인하고 꺼져 있으면 아무것도 쓰지 않는다.
import { lstat, mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { t } from '../i18n';
import { DataError, type DataErrorKind } from './errors';

/** 데이터 계층이 의존하는 쓰기 인터페이스. 메서드 이름은 ESLint가 금지하는 fs API 이름과 겹치지 않게 지었다. */
export interface DataWriter {
  /** 같은 폴더의 임시 파일(`.<이름>.tmp`)에 쓴 뒤 바꿔치기한다. 기존 파일은 덮어쓴다. UTF-8, BOM 없음. */
  writeTextAtomic(filePath: string, text: string): Promise<void>;
  /** 폴더를 만든다. 이미 있으면 conflict */
  makeDirectory(dirPath: string): Promise<void>;
  /** 파일이나 폴더의 이름을 바꾼다. 대상이 이미 있으면 conflict. 대소문자만 바꾸는 경우도 처리한다. */
  move(from: string, to: string): Promise<void>;
  /** 파일을 지운다. 없으면 notFound */
  removeFile(filePath: string): Promise<void>;
  /** 빈 폴더를 지운다. 비어 있지 않으면 conflict */
  removeEmptyDirectory(dirPath: string): Promise<void>;
}

export interface DataWriterOptions {
  /** 데이터 폴더 절대 경로. 쓰기 대상은 이 폴더 바로 아래(주제 폴더)나 그 아래(논문 파일)여야 한다. */
  root: string;
  /** 쓰기 허용 여부 (설정 arxivjs.enableWrite). 호출할 때마다 확인한다. */
  isEnabled: () => boolean;
}

function toDataError(err: unknown, p: string): DataError {
  if (err instanceof DataError) {
    return err;
  }
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const kind: DataErrorKind =
    code === 'ENOENT'
      ? 'notFound'
      : code === 'ENOTDIR'
        ? 'notDirectory'
        : code === 'EEXIST' || code === 'ENOTEMPTY'
          ? 'conflict'
          : 'io';
  const reason = err instanceof Error ? err.message : String(err);
  return new DataError(kind, p, reason, { cause: err });
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

/** node:fs/promises 기반 구현 */
export function createDataWriter({ root, isEnabled }: DataWriterOptions): DataWriter {
  const base = path.resolve(root);

  /** 쓰기 허용 여부와 경로를 확인하고, 정규화한 절대 경로를 돌려준다. */
  const check = (p: string): string => {
    if (!isEnabled()) {
      throw new DataError('writeDisabled', p, 'data folder writes are disabled (setting arxivjs.enableWrite)');
    }
    const abs = path.resolve(p);
    const rel = path.relative(base, abs);
    const depth = rel.split(path.sep).length;
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || depth > 2) {
      throw new DataError('invalidPath', p, 'only topic folders in the data folder and files in them can be written');
    }
    return abs;
  };

  const run = async <T>(p: string, op: (abs: string) => Promise<T>): Promise<T> => {
    const abs = check(p);
    try {
      return await op(abs);
    } catch (err) {
      throw toDataError(err, p);
    }
  };

  return {
    writeTextAtomic: (filePath, text) =>
      run(filePath, async (abs) => {
        const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.tmp`);
        try {
          await writeFile(tmp, text, { encoding: 'utf8' });
          await rename(tmp, abs);
        } catch (err) {
          await rm(tmp, { force: true }).catch(() => undefined);
          throw err;
        }
      }),

    makeDirectory: (dirPath) => run(dirPath, (abs) => mkdir(abs)),

    move: (from, to) =>
      run(from, async (absFrom) => {
        const absTo = check(to);
        if (absFrom === absTo) {
          return;
        }
        if (absFrom.toLowerCase() === absTo.toLowerCase()) {
          // 대소문자만 다르다. 대소문자를 구분하지 않는 파일 시스템에서는 대상이 "이미 있는" 것으로 보이므로 임시 이름을 거친다.
          const tmp = path.join(path.dirname(absTo), `.${path.basename(absTo)}.renaming`);
          await rename(absFrom, tmp);
          await rename(tmp, absTo);
          return;
        }
        if (await exists(absTo)) {
          throw new DataError('conflict', to, t().data.targetExists);
        }
        await rename(absFrom, absTo);
      }),

    removeFile: (filePath) => run(filePath, (abs) => rm(abs)),

    removeEmptyDirectory: (dirPath) => run(dirPath, (abs) => rmdir(abs)),
  };
}
