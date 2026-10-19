// 쓰기 제한 ESLint 규칙(eslint.config.mjs)이 실제로 위반을 잡는지 검증한다.
// 쓰기는 src/data/dataWriter.ts에서만 허용한다 (DEV-PLAN §7.1).
import { ESLint } from 'eslint';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const eslint = new ESLint({ cwd: root });

async function ruleIds(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.map((m) => m.ruleId ?? m.message);
}

// ESLint 첫 실행(설정과 TypeScript 파서 로딩)은 느리므로 미리 한 번 돌려 둔다.
beforeAll(() => ruleIds('export {};', 'src/views/sample.ts'), 30000);

const RESTRICTED = 'no-restricted-syntax';
const RESTRICTED_IMPORT = 'no-restricted-imports';

describe('fs 모듈 import 제한', () => {
  it.each([
    "import * as fs from 'fs';",
    "import { readFile } from 'node:fs/promises';",
  ])('src/data/readonlyFs.ts 밖에서는 금지: %s', async (code) => {
    expect(await ruleIds(`${code}\nexport {};`, 'src/views/sample.ts')).toContain(RESTRICTED_IMPORT);
  });

  it('require, 동적 import도 금지', async () => {
    expect(await ruleIds("export const f = require('fs');", 'src/views/sample.ts')).toContain(RESTRICTED);
    expect(await ruleIds("export const f = import('node:fs');", 'src/views/sample.ts')).toContain(RESTRICTED);
  });

  it('src/data의 다른 모듈에서도 금지', async () => {
    expect(await ruleIds("import * as fs from 'node:fs/promises';\nexport { fs };", 'src/data/topicOps.ts')).toContain(RESTRICTED_IMPORT);
  });

  it('readonlyFs.ts에서는 읽기 API import를 허용', async () => {
    const code = "import { readFile, readdir, stat } from 'node:fs/promises';\nexport { readFile, readdir, stat };";
    expect(await ruleIds(code, 'src/data/readonlyFs.ts')).toEqual([]);
  });
});

describe('쓰기 API 금지', () => {
  it.each([
    "import { writeFile } from 'node:fs/promises';\nexport { writeFile };",
    "import * as fs from 'node:fs/promises';\nexport const w = () => fs.writeFile('a', 'b');",
    "import * as fs from 'node:fs';\nexport const { unlinkSync } = fs;",
    "import * as fs from 'node:fs';\nexport const w = () => fs.mkdirSync('a');",
    "import * as fs from 'node:fs/promises';\nexport const w = () => fs.rm('a');",
    "import * as fs from 'node:fs/promises';\nexport const w = () => fs.open('a', 'w');",
  ])('readonlyFs.ts에서도 금지: %s', async (code) => {
    expect(await ruleIds(code, 'src/data/readonlyFs.ts')).toContain(RESTRICTED);
  });

  it.each([
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.fs.writeFile(u, new Uint8Array());",
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.fs.delete(u);",
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.fs.copy(u, u);",
    "import * as vscode from 'vscode';\nexport const w = () => new vscode.WorkspaceEdit();",
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.openTextDocument(u);",
  ])('vscode 쓰기·편집 API 금지: %s', async (code) => {
    expect(await ruleIds(code, 'src/views/sample.ts')).toContain(RESTRICTED);
  });

  it('dataWriter.ts 밖의 데이터 모듈에서도 금지', async () => {
    const code = "export const w = (x: { rename(a: string, b: string): void }) => x.rename('a', 'b');";
    expect(await ruleIds(code, 'src/data/topicOps.ts')).toContain(RESTRICTED);
  });

  it('Map.delete 같은 일반 코드는 readonlyFs.ts 밖에서 허용', async () => {
    const code = 'const m = new Map<string, number>();\nm.delete("a");\nexport { m };';
    expect(await ruleIds(code, 'src/data/paperRepository.ts')).toEqual([]);
  });

  it('DataWriter 메서드 이름(move, makeDirectory 등)은 허용', async () => {
    const code =
      "import type { DataWriter } from './dataWriter';\nexport const f = (w: DataWriter) => Promise.all([w.move('a', 'b'), w.makeDirectory('c'), w.writeTextAtomic('d', ''), w.removeFile('e'), w.removeEmptyDirectory('f')]);";
    expect(await ruleIds(code, 'src/data/topicOps.ts')).toEqual([]);
  });

  it('테스트 코드에서도 쓰기 API 금지', async () => {
    const code = "import * as fs from 'node:fs';\nexport const w = () => fs.writeFileSync('a', 'b');";
    expect(await ruleIds(code, 'test/unit/sample.test.ts')).toContain(RESTRICTED);
  });
});

describe('쓰기 지점 (dataWriter.ts)', () => {
  it('fs 쓰기 API를 허용한다', async () => {
    const code =
      "import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';\nexport const w = () => Promise.all([mkdir('a'), rename('a', 'b'), rm('c'), rmdir('d'), writeFile('e', '')]);";
    expect(await ruleIds(code, 'src/data/dataWriter.ts')).toEqual([]);
  });

  it.each([
    "import * as vscode from 'vscode';\nexport const w = () => new vscode.WorkspaceEdit();",
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.fs.writeFile(u, new Uint8Array());",
    "import * as vscode from 'vscode';\nexport const w = (u: vscode.Uri) => vscode.workspace.openTextDocument(u);",
  ])('vscode 편집 API는 여기서도 금지: %s', async (code) => {
    expect(await ruleIds(code, 'src/data/dataWriter.ts')).toContain(RESTRICTED);
  });
});
