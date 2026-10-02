// 확장 호스트용 번들 (src/extension.ts → dist/extension.js)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

// KaTeX CSS와 폰트를 webview 리소스로 복사한다 (렌더링에 쓰는 katex와 같은 버전).
function copyKatexAssets() {
  mkdirSync('dist/katex', { recursive: true });
  cpSync('node_modules/katex/dist/katex.min.css', 'dist/katex/katex.min.css');
  cpSync('node_modules/katex/dist/fonts', 'dist/katex/fonts', {
    recursive: true,
    filter: (src) => !/\.(ttf|woff)$/.test(src), // woff2만 쓴다
  });
}
copyKatexAssets();

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
