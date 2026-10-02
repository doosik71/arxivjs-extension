import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/integration/**/*.test.js',
  version: 'stable',
  // 실사용 데이터 폴더가 아니라 fixture 폴더를 연다.
  workspaceFolder: './test/fixtures',
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
