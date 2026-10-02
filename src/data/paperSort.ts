import type { Paper, PaperSort } from './models';

type Compare = (a: Paper, b: Paper) => number;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** 숫자 내림차순, 값이 없으면 맨 뒤 */
const descMissingLast =
  (pick: (p: Paper) => number | undefined): Compare =>
  (a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === undefined || y === undefined) {
      return x === y ? 0 : x === undefined ? 1 : -1;
    }
    return y - x;
  };

const byCitation = descMissingLast((p) => p.meta.citation);
const byYear = descMissingLast((p) => p.meta.year);
const byTitle: Compare = (a, b) => collator.compare(a.meta.title, b.meta.title) || a.stem.localeCompare(b.stem);

const chain =
  (...cmps: Compare[]): Compare =>
  (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) {
        return r;
      }
    }
    return 0;
  };

const COMPARATORS: Record<PaperSort, Compare> = {
  citation: chain(byCitation, byYear, byTitle),
  year: chain(byYear, byCitation, byTitle),
  title: chain(byTitle, byYear),
};

/** 정렬된 새 배열을 돌려준다 (DEV-PLAN §6.2). */
export function sortPapers(papers: readonly Paper[], mode: PaperSort): Paper[] {
  return [...papers].sort(COMPARATORS[mode] ?? COMPARATORS.citation);
}
