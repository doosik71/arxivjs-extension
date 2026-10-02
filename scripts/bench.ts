// 성능 측정 (DEV-PLAN §5.4). 데이터 폴더를 읽기만 한다.
//
//   npm run bench                 → test/fixtures/sample-data
//   npm run bench -- <데이터 폴더>  → 실데이터 (읽기 전용)
//
// 목표를 넘으면 종료 코드 1.
import * as path from 'node:path';
import { Library } from '../src/data/library';
import type { Paper } from '../src/data/models';
import { nodeReadonlyFs } from '../src/data/readonlyFs';
import { PaperRenderer } from '../src/render/markdown';
import { buildTopicHtml, toTopicRow } from '../src/render/topicHtml';
import { mapLimit } from '../src/util/mapLimit';

const TARGETS = {
  topicListMs: 100, // 주제 목록 "즉시"
  topicLoadMs: 500, // 가장 큰 주제의 첫 로딩
  renderMs: 200, // 가장 큰 md 렌더링
};

const root = path.resolve(process.argv[2] ?? 'test/fixtures/sample-data');
const warnings: string[] = [];
const log = { info() {}, warn: (m: string) => warnings.push(m), error: (m: unknown) => warnings.push(String(m)) };

const now = () => performance.now();
const ms = (v: number) => `${v.toFixed(1)}ms`;
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

async function main(): Promise<number> {
  console.log(`데이터 폴더: ${root}`);
  const results: { name: string; value: number; target: number }[] = [];

  // 1. 주제 목록
  const library = new Library(root, nodeReadonlyFs, log, () => 'citation');
  let t = now();
  const topics = await library.topics.list();
  results.push({ name: `주제 목록 (${topics.length}개)`, value: now() - t, target: TARGETS.topicListMs });

  // 2. 주제별 첫 로딩 (각 주제를 새 캐시로 한 번씩 읽어서 가장 느린 주제를 찾는다)
  const loads: { id: string; count: number; time: number }[] = [];
  const allPapers: Paper[] = [];
  for (const topic of topics) {
    t = now();
    const papers = await library.papers.list(topic);
    loads.push({ id: topic.id, count: papers.length, time: now() - t });
    allPapers.push(...papers);
  }
  const biggest = loads.reduce((a, b) => (b.count > a.count ? b : a), loads[0]);
  const slowest = loads.reduce((a, b) => (b.time > a.time ? b : a), loads[0]);
  results.push({ name: `가장 큰 주제 첫 로딩 (${biggest.id}, ${biggest.count}편)`, value: biggest.time, target: TARGETS.topicLoadMs });
  results.push({ name: `가장 느린 주제 첫 로딩 (${slowest.id}, ${slowest.count}편)`, value: slowest.time, target: TARGETS.topicLoadMs });

  // Topic 패널 HTML (가장 큰 주제)
  const bigTopic = topics.find((x) => x.id === biggest.id)!;
  const bigPapers = await library.papers.list(bigTopic);
  t = now();
  buildTopicHtml(
    { topicId: bigTopic.id, topicLabel: bigTopic.label, rows: bigPapers.map(toTopicRow), defaultSort: 'citation', notices: [] },
    { cspSource: 'x', nonce: 'n', styleUris: [], scriptUris: [] },
  );
  const topicHtmlMs = now() - t;

  // 3. 모든 md 렌더링: 가장 큰 문서의 시간, 분포, 예외
  const withMd = allPapers.filter((p) => p.mdPath);
  const sources = await mapLimit(withMd, 16, async (p) => ({ paper: p, text: (await library.papers.readMarkdown(p)) ?? '' }));
  const renderer = new PaperRenderer();
  renderer.render('$x$ warm-up'); // KaTeX 첫 호출 비용은 빼고 잰다.
  const times: number[] = [];
  const failures: string[] = [];
  let largest = { id: '', chars: 0, time: 0 };
  for (const { paper, text } of sources) {
    t = now();
    try {
      renderer.render(text, { stripHeader: true });
    } catch (err) {
      failures.push(`${paper.id}: ${String(err)}`);
      continue;
    }
    const time = now() - t;
    times.push(time);
    if (text.length > largest.chars) {
      largest = { id: paper.id, chars: text.length, time };
    }
  }
  // 가장 큰 문서는 3번 재서 중앙값을 쓴다.
  const big = sources.find((s) => s.paper.id === largest.id);
  if (big) {
    const runs = [0, 1, 2].map(() => {
      const s = now();
      new PaperRenderer().render(big.text, { stripHeader: true });
      return now() - s;
    });
    largest.time = runs.sort((a, b) => a - b)[1];
  }
  results.push({ name: `가장 큰 md 렌더링 (${largest.chars.toLocaleString('en-US')}자, ${largest.id})`, value: largest.time, target: TARGETS.renderMs });

  // 결과
  console.log('');
  let failed = failures.length > 0;
  for (const r of results) {
    const ok = r.value <= r.target;
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.name}: ${ms(r.value)} (목표 ${r.target}ms 이하)`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  console.log('');
  console.log(`참고  전체 ${allPapers.length}편, md ${withMd.length}개 렌더링: p50 ${ms(percentile(sorted, 0.5))}, p95 ${ms(percentile(sorted, 0.95))}, 최대 ${ms(sorted.at(-1) ?? 0)}`);
  console.log(`참고  Topic 패널 HTML (${biggest.count}편): ${ms(topicHtmlMs)}`);
  console.log(`참고  렌더링 예외 ${failures.length}건, 데이터 경고 ${warnings.length}건`);
  for (const f of failures.slice(0, 10)) {
    console.log(`  - ${f}`);
  }
  for (const w of warnings.slice(0, 10)) {
    console.log(`  - ${w}`);
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
