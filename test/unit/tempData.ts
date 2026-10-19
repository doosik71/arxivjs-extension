// 쓰기 테스트용: fixture(sample-data)를 OS 임시 폴더로 복사한다 (DEV-PLAN §7.2).
// 원본 fixture와 실사용 데이터 폴더에는 절대 쓰지 않는다.
import { chmodSync, cpSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const FIXTURE = path.resolve(__dirname, '../fixtures/sample-data');

export interface TempData {
  root: string;
  cleanup(): void;
}

/** fixture를 새 임시 폴더로 복사한다. 테스트가 끝나면 cleanup()을 부른다. */
export function copyFixture(): TempData {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'arxivjs-test-'));
  const root = path.join(dir, 'sample-data');
  cpSync(FIXTURE, root, { recursive: true });
  makeWritable(root); // 통합 테스트가 fixture를 읽기 전용으로 바꿔 둔 상태에서 복사했을 수 있다.
  return {
    root,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** 임시 복사본 안에 파일을 만든다. mtime을 주면 수정 시각도 맞춘다. root 밖에는 쓰지 않는다. */
export function putFile(data: TempData, rel: string, content: string, mtime?: Date): string {
  const full = path.join(data.root, rel);
  if (path.relative(data.root, full).startsWith('..')) {
    throw new Error(`임시 복사본 밖의 경로: ${rel}`);
  }
  writeFileSync(full, content, 'utf8');
  if (mtime) {
    utimesSync(full, mtime, mtime);
  }
  return full;
}

/** 임시 복사본 안의 파일을 지운다. */
export function removeTempFile(data: TempData, rel: string): void {
  const full = path.join(data.root, rel);
  if (path.relative(data.root, full).startsWith('..')) {
    throw new Error(`임시 복사본 밖의 경로: ${rel}`);
  }
  rmSync(full);
}

function makeWritable(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      makeWritable(full);
    } else {
      chmodSync(full, 0o666);
    }
  }
}
