// Topic 패널 표의 정렬·필터 규칙. webview(브라우저)와 단위 테스트(Node)에서 함께 쓴다.
// 정렬 규칙은 src/data/paperSort.ts와 같다: 숫자 값이 없으면 방향과 관계없이 맨 뒤.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ArxivjsTopicModel = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  /** 열을 처음 누를 때의 방향: 제목은 오름차순, 숫자는 내림차순 */
  const DEFAULT_DIR = { title: 1, year: -1, citation: -1 };

  const byNumber = (pick, dir) => (a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === undefined || x === null || y === undefined || y === null) {
      const xm = x === undefined || x === null;
      const ym = y === undefined || y === null;
      return xm === ym ? 0 : xm ? 1 : -1;
    }
    return dir * (x - y);
  };
  const byTitle = (dir) => (a, b) => dir * collator.compare(a.title, b.title);
  const chain =
    (...cmps) =>
    (a, b) => {
      for (const c of cmps) {
        const r = c(a, b);
        if (r !== 0) {
          return r;
        }
      }
      return 0;
    };

  /** sort: { key: 'title' | 'year' | 'citation', dir: 1 | -1 } */
  function comparator(sort) {
    const citationDesc = byNumber((r) => r.citation, -1);
    const yearDesc = byNumber((r) => r.year, -1);
    switch (sort.key) {
      case 'title':
        return chain(byTitle(sort.dir), yearDesc);
      case 'year':
        return chain(byNumber((r) => r.year, sort.dir), citationDesc, byTitle(1));
      default:
        return chain(byNumber((r) => r.citation, sort.dir), yearDesc, byTitle(1));
    }
  }

  /** 같은 열을 다시 누르면 방향을 뒤집고, 다른 열이면 그 열의 기본 방향 */
  function nextSort(current, key) {
    return current.key === key ? { key, dir: -current.dir } : { key, dir: DEFAULT_DIR[key] || -1 };
  }

  function initialSort(defaultSort) {
    const key = DEFAULT_DIR[defaultSort] ? defaultSort : 'citation';
    return { key, dir: DEFAULT_DIR[key] };
  }

  /** 필터 문자열 → 소문자 토큰. 모든 토큰이 제목+저자에 들어 있어야 보인다. */
  function tokenize(filter) {
    return String(filter || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  function matches(row, tokens, onlyMarkdown) {
    if (onlyMarkdown && !row.hasMarkdown) {
      return false;
    }
    const haystack = `${row.title} ${row.authors}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  }

  // ---- 홈(주제 목록) ----

  /** 주제 이름(표시 이름과 폴더 이름)에 모든 토큰이 들어 있는지 */
  function matchesTopic(topic, tokens) {
    const haystack = `${topic.label} ${topic.id}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  }

  /** sort: 'name'(이름 오름차순) | 'count'(논문 수 내림차순, 같으면 이름) */
  function topicComparator(sort) {
    const byName = (a, b) => collator.compare(a.label, b.label);
    if (sort === 'count') {
      return chain(
        byNumber((t) => t.count, -1),
        byName,
      );
    }
    return byName;
  }

  return { DEFAULT_DIR, comparator, nextSort, initialSort, tokenize, matches, matchesTopic, topicComparator };
});
