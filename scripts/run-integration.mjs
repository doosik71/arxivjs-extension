// 통합 테스트 실행기: 읽기 전용 보장을 검증한다 (DEV-PLAN §7).
//
//   1. test/fixtures의 모든 파일·폴더 스냅숏(경로, 크기, mtime, SHA-256)을 뜬다.
//   2. fixture 파일을 OS 수준 읽기 전용으로 바꾼다 (실수로 쓰면 EPERM으로 실패한다).
//   3. vscode-test로 통합 테스트를 돌린다.
//   4. 읽기 전용을 원래대로 되돌리고, 스냅숏을 다시 떠서 비교한다.
//      파일이 하나라도 생기거나, 사라지거나, 바뀌었으면 실패한다.
//
// Windows의 읽기 전용 속성은 폴더 안에 새 파일을 만드는 것까지 막지는 못하지만, 4단계의 비교가 잡아낸다.
import { createHash } from 'node:crypto';
import { chmodSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const FIXTURES = 'test/fixtures';
const isWindows = process.platform === 'win32';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    out.push({ full, isDir: entry.isDirectory() });
    if (entry.isDirectory()) {
      walk(full, out);
    }
  }
  return out;
}

function snapshot() {
  const map = new Map();
  for (const { full, isDir } of walk(FIXTURES)) {
    const key = relative(FIXTURES, full).split('\\').join('/');
    if (isDir) {
      map.set(key, 'dir');
    } else {
      const s = statSync(full);
      const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
      map.set(key, `${s.size}:${s.mtimeMs}:${hash}`);
    }
  }
  return map;
}

function diff(before, after) {
  const changes = [];
  for (const [k, v] of before) {
    if (!after.has(k)) {
      changes.push(`삭제됨: ${k}`);
    } else if (after.get(k) !== v) {
      changes.push(`변경됨: ${k}`);
    }
  }
  for (const k of after.keys()) {
    if (!before.has(k)) {
      changes.push(`생김: ${k}`);
    }
  }
  return changes;
}

/** fixture를 읽기 전용으로 바꾸고, 되돌리는 함수를 돌려준다. */
function makeReadonly() {
  if (isWindows) {
    const run = (flag) => spawnSync('attrib', [flag, join(FIXTURES, '*'), '/S', '/D'], { stdio: 'ignore', shell: false });
    run('+R');
    return () => run('-R');
  }
  const modes = walk(FIXTURES).map(({ full, isDir }) => ({ full, isDir, mode: statSync(full).mode & 0o777 }));
  for (const { full, isDir, mode } of modes) {
    chmodSync(full, isDir ? mode & 0o555 : mode & 0o444);
  }
  return () => {
    for (const { full, mode } of [...modes].reverse()) {
      chmodSync(full, mode);
    }
  };
}

const before = snapshot();
console.log(`[readonly-guard] fixture 스냅숏: 항목 ${before.size}개. 읽기 전용으로 바꾸고 통합 테스트를 실행한다.`);
const restore = makeReadonly();
let status;
try {
  // READONLY_GUARD_CMD: 가드 자체를 검증할 때만 쓰는 대체 명령
  const command = process.env.READONLY_GUARD_CMD ?? ['npx', 'vscode-test', ...process.argv.slice(2)].join(' ');
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  status = result.status ?? 1;
} finally {
  restore();
}

const changes = diff(before, snapshot());
if (changes.length > 0) {
  console.error(`[readonly-guard] 실패: 테스트 중 fixture가 바뀌었다 (${changes.length}건)`);
  for (const c of changes) {
    console.error(`  - ${c}`);
  }
  process.exit(2);
}
console.log('[readonly-guard] 통과: 테스트 전후 fixture가 똑같다.');
process.exit(status);
