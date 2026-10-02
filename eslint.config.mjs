// ESLint 설정
//
// 이 확장은 데이터 폴더를 절대 수정하지 않는다(DEV-PLAN §7).
// 아래 규칙으로 쓰기 API 사용을 정적으로 차단한다.
//   1. 파일 시스템 모듈(fs 등)은 src/data/readonlyFs.ts에서만 import/require 할 수 있다.
//   2. 쓰기·변경 API 이름은 어디에서도 쓸 수 없다.
//   3. readonlyFs.ts에서는 Map.delete 등과 이름이 겹쳐 전역 금지가 어려운
//      일반 이름(write, rm, cp, open 등)까지 추가로 금지한다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const FS_MODULES = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'original-fs', 'fs-extra', 'graceful-fs'];
const FS_MODULE_RE = '/^(node:)?(fs|fs\\/promises|original-fs|fs-extra|graceful-fs)$/';

// 어디에서도 쓸 수 없는 이름 (node:fs, vscode.workspace.fs, WorkspaceEdit 등)
const WRITE_APIS = [
  'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream',
  'writeSync', 'writev', 'writevSync',
  'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync',
  'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync',
  'rename', 'renameSync', 'copyFile', 'copyFileSync', 'cpSync',
  'truncate', 'truncateSync', 'ftruncate', 'ftruncateSync',
  'symlink', 'symlinkSync', 'linkSync',
  'chmod', 'chmodSync', 'chown', 'chownSync', 'lchown', 'lchownSync',
  'utimes', 'utimesSync', 'lutimes', 'lutimesSync', 'futimes', 'futimesSync',
  'createDirectory', 'applyEdit', 'openTextDocument', 'WorkspaceEdit',
];
// readonlyFs.ts에서만 추가로 금지하는 일반 이름
const AMBIGUOUS_WRITE_APIS = ['write', 'rm', 'cp', 'link', 'delete', 'copy', 'open', 'openSync'];
// vscode.workspace.fs.delete / .copy 처럼 `.fs.` 아래의 일반 이름
const WORKSPACE_FS_WRITE = ['delete', 'copy', 'rename', 'writeFile', 'createDirectory'];

const re = (names) => `/^(${names.join('|')})$/`;
const MSG = '읽기 전용 확장: 쓰기·변경 API는 사용할 수 없다 (DEV-PLAN §7).';
const FS_MSG = '데이터 폴더 접근은 src/data/readonlyFs.ts를 통해서만 한다.';

const banNames = (names) => [
  { selector: `MemberExpression[property.name=${re(names)}]`, message: MSG },
  { selector: `ImportSpecifier[imported.name=${re(names)}]`, message: MSG },
  { selector: `ObjectPattern > Property[key.name=${re(names)}]`, message: MSG },
];
const banWorkspaceFsWrites = [
  { selector: `MemberExpression[object.property.name='fs'][property.name=${re(WORKSPACE_FS_WRITE)}]`, message: MSG },
];
const banDynamicFsImport = [
  { selector: `CallExpression[callee.name='require'][arguments.0.value=${FS_MODULE_RE}]`, message: FS_MSG },
  { selector: `ImportExpression[source.value=${FS_MODULE_RE}]`, message: FS_MSG },
];

const commonRestrictions = [...banNames(WRITE_APIS), ...banWorkspaceFsWrites];

export default tseslint.config(
  { ignores: ['dist/**', 'out/**', 'node_modules/**', '.vscode-test/**', 'test/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { paths: FS_MODULES.map((name) => ({ name, message: FS_MSG })) }],
      'no-restricted-syntax': ['error', ...commonRestrictions, ...banDynamicFsImport],
    },
  },
  {
    // 유일한 파일 시스템 접근 지점: fs import는 허용하고, 쓰기 금지는 더 엄격하게 한다.
    files: ['src/data/readonlyFs.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', ...commonRestrictions, ...banNames(AMBIGUOUS_WRITE_APIS)],
    },
  },
  {
    // 테스트는 fixture를 읽기 위해 fs import를 허용한다. 쓰기 금지는 유지한다.
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', ...commonRestrictions],
    },
  },
  {
    // webview 스크립트 (브라우저)
    files: ['media/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: Object.fromEntries(
        ['acquireVsCodeApi', 'window', 'document', 'Element', 'setTimeout', 'clearTimeout'].map((g) => [g, 'readonly']),
      ),
    },
  },
  {
    files: ['**/*.mjs', '**/*.mts'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
