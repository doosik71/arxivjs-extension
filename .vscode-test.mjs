import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/integration/test/integration/**/*.test.js',
  // 최소 지원 버전 확인: VSCODE_TEST_VERSION=1.90.0 npm run test:integration
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  download: { timeout: 120000 },
  // 실사용 데이터 폴더가 아니라 fixture 폴더를 연다.
  workspaceFolder: './test/fixtures',
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
