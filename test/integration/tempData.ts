// 쓰기 통합 테스트용: fixture(sample-data)를 OS 임시 폴더로 복사한다 (DEV-PLAN §7.2).
// 원본 fixture와 실사용 데이터 폴더에는 절대 쓰지 않는다. run-integration.mjs가 원본이 그대로인지 검증한다.
import { chmodSync, cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface TempData {
  root: string;
  /** 임시 복사본 안에 파일을 만든다. */
  put(rel: string, content: string): void;
  cleanup(): void;
}

/** fixture 폴더를 새 임시 폴더로 복사한다. 통합 테스트는 fixture를 읽기 전용으로 바꿔 두므로 쓰기 권한을 되돌린다. */
export function copyFixture(fixture: string): TempData {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'arxivjs-it-'));
  const root = path.join(dir, 'sample-data');
  cpSync(fixture, root, { recursive: true });
  makeWritable(root);
  return {
    root,
    put: (rel, content) => {
      const full = path.join(root, rel);
      if (path.relative(root, full).startsWith('..')) {
        throw new Error(`임시 복사본 밖의 경로: ${rel}`);
      }
      writeFileSync(full, content, 'utf8');
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function makeWritable(dir: string): void {
  chmodSync(dir, 0o777);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      makeWritable(full);
    } else {
      chmodSync(full, 0o666);
    }
  }
}
