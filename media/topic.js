// Topic 패널 webview 스크립트: 논문 표 그리기, 정렬·필터, 초록 펼치기 (DEV-PLAN §3.2)
// 데이터 문자열은 모두 textContent로 넣는다. innerHTML은 확장이 렌더링한 초록 HTML에만 쓴다.
(function () {
  const vscode = acquireVsCodeApi();
  const data = JSON.parse(document.getElementById('topic-data').textContent);
  const rowsEl = document.getElementById('rows');
  const filterEl = document.getElementById('filter');
  const onlyMarkdownEl = document.getElementById('onlyMarkdown');
  const countEl = document.getElementById('count');
  const emptyEl = document.getElementById('empty');
  const numberFormat = new Intl.NumberFormat('en-US');
  const model = window.ArxivjsTopicModel; // media/topicModel.js (정렬·필터 규칙)

  // 같은 주제를 다시 그릴 때(Reload) 정렬·필터·스크롤·펼친 초록을 유지한다.
  const saved = vscode.getState();
  const state =
    saved && saved.topicId === data.topicId
      ? saved
      : { topicId: data.topicId, sort: model.initialSort(data.defaultSort), filter: '', onlyMarkdown: false, scrollY: 0, expanded: [] };
  const expanded = new Set(state.expanded);
  const saveState = () => vscode.setState({ ...state, expanded: [...expanded] });

  // ---- 행 만들기 ----
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') {
        node.textContent = v;
      } else if (v !== undefined && v !== false) {
        node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children) {
      if (c) {
        node.append(c);
      }
    }
    return node;
  }

  // 저자 줄: 한 줄까지만 보이고 넘치면 "…" + "(N명)". 툴팁은 앞부분만 (저자가 1,351명인 논문도 있다).
  const AUTHORS_TOOLTIP_CHARS = 300;
  function authorsLine(row) {
    const tooltip =
      row.authors.length > AUTHORS_TOOLTIP_CHARS
        ? `${row.authors.slice(0, AUTHORS_TOOLTIP_CHARS)}… (총 ${numberFormat.format(row.authorCount)}명)`
        : row.authors;
    return el(
      'div',
      { class: 'authors', title: tooltip },
      el('span', { class: 'authors-text', text: row.authors }),
      el('span', { class: 'authors-count', text: `(${numberFormat.format(row.authorCount)}명)` }),
    );
  }

  const items = data.rows.map((row) => {
    const titleCell = el(
      'td',
      { class: 'col-title' },
      el('button', { type: 'button', class: 'link title', 'data-action': 'openPaper', text: row.title, title: '논문 열기' }),
      row.source ? el('span', { class: `badge source-${row.source.toLowerCase()}`, text: row.source }) : null,
      row.metaError ? el('span', { class: 'tag tag-warning', text: '메타 오류', title: '메타 정보(.json)를 읽지 못했습니다' }) : null,
      row.hasMarkdown ? null : el('span', { class: 'tag', text: '문서 없음' }),
      row.authors ? authorsLine(row) : null,
    );
    const actions = el(
      'td',
      { class: 'col-actions' },
      row.hasAbstract ? el('button', { type: 'button', 'data-action': 'toggleAbstract', 'aria-expanded': 'false', text: '초록' }) : null,
      row.hasUrl ? el('button', { type: 'button', 'data-action': 'openExternal', text: '원문', title: '원문 URL 열기' }) : null,
    );
    const tr = el(
      'tr',
      { class: 'paper', 'data-id': row.id },
      titleCell,
      el('td', { class: 'col-year', text: row.year === undefined ? '–' : String(row.year) }),
      el('td', { class: 'col-citation', text: row.citation === undefined ? '–' : numberFormat.format(row.citation) }),
      actions,
    );
    const abstractBody = el('div', { class: 'abstract-body' });
    const abstractRow = el('tr', { class: 'abstract-row', hidden: true }, el('td', { colspan: '4' }, abstractBody));
    return { row, tr, abstractRow, abstractBody, authorsEl: titleCell.querySelector('.authors'), loaded: false };
  });
  const byId = new Map(items.map((it) => [it.row.id, it]));

  // ---- 그리기 ----
  /** 보이는 행 중 저자 줄이 잘린 행에 표시를 붙인다. 창 크기가 바뀌면 다시 잰다. */
  function markTruncatedAuthors() {
    for (const it of items) {
      const line = it.authorsEl;
      if (line && !it.tr.hidden) {
        const text = line.firstChild;
        line.classList.toggle('truncated', text.scrollWidth > text.clientWidth + 1);
      }
    }
  }

  function render() {
    const cmp = model.comparator(state.sort);
    const tokens = model.tokenize(state.filter);
    const sorted = [...items].sort((a, b) => cmp(a.row, b.row));
    const fragment = document.createDocumentFragment();
    let visible = 0;
    for (const it of sorted) {
      const show = model.matches(it.row, tokens, state.onlyMarkdown);
      it.tr.hidden = !show;
      it.abstractRow.hidden = !show || !expanded.has(it.row.id);
      visible += show ? 1 : 0;
      fragment.append(it.tr, it.abstractRow);
    }
    rowsEl.append(fragment);
    countEl.textContent = visible === items.length ? `${items.length}편` : `${visible} / ${items.length}편`;
    emptyEl.hidden = visible > 0 || items.length === 0;
    markTruncatedAuthors();
    for (const th of document.querySelectorAll('th')) {
      const button = th.querySelector('.sort');
      const active = button && button.dataset.sort === state.sort.key;
      th.setAttribute('aria-sort', active ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
      if (button) {
        button.classList.toggle('active', Boolean(active));
        button.dataset.dir = active ? (state.sort.dir > 0 ? '▲' : '▼') : '';
      }
    }
  }

  function setExpanded(it, open) {
    const button = it.tr.querySelector('[data-action="toggleAbstract"]');
    if (open) {
      expanded.add(it.row.id);
      if (!it.loaded) {
        it.abstractBody.textContent = '불러오는 중…';
        vscode.postMessage({ type: 'abstract', id: it.row.id });
      }
    } else {
      expanded.delete(it.row.id);
    }
    it.abstractRow.hidden = !open;
    if (button) {
      button.setAttribute('aria-expanded', String(open));
    }
  }

  // ---- 이벤트 ----
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action], .sort') : null;
    if (!target) {
      return;
    }
    if (target.classList.contains('sort')) {
      const key = target.dataset.sort;
      state.sort = model.nextSort(state.sort, key);
      saveState();
      render();
      return;
    }
    const action = target.getAttribute('data-action');
    if (action === 'reload') {
      vscode.postMessage({ type: 'reload' });
      return;
    }
    const tr = target.closest('tr.paper');
    const it = tr && byId.get(tr.dataset.id);
    if (!it) {
      return;
    }
    if (action === 'toggleAbstract') {
      setExpanded(it, !expanded.has(it.row.id));
      saveState();
    } else if (action === 'openPaper' || action === 'openExternal') {
      vscode.postMessage({ type: action, id: it.row.id });
    }
  });

  let filterTimer;
  filterEl.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filter = filterEl.value;
      saveState();
      render();
    }, 80);
  });
  onlyMarkdownEl.addEventListener('change', () => {
    state.onlyMarkdown = onlyMarkdownEl.checked;
    saveState();
    render();
  });

  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      state.scrollY = window.scrollY;
      saveState();
    }, 100);
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'abstract') {
      const it = byId.get(msg.id);
      if (it) {
        it.loaded = true;
        it.abstractBody.innerHTML = msg.html; // 확장이 markdown-it(html:false)+KaTeX로 렌더링한 HTML
      }
    }
  });

  // 표 머리글이 고정 헤더 바로 아래에 붙도록 헤더 높이를 CSS 변수로 넘긴다.
  const header = document.querySelector('.topic-header');
  const setHeaderHeight = () => document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  new ResizeObserver(setHeaderHeight).observe(header);
  new ResizeObserver(markTruncatedAuthors).observe(document.querySelector('table.papers'));

  // ---- 시작 ----
  filterEl.value = state.filter;
  onlyMarkdownEl.checked = state.onlyMarkdown;
  render();
  for (const id of expanded) {
    const it = byId.get(id);
    if (it) {
      setExpanded(it, true);
    } else {
      expanded.delete(id);
    }
  }
  window.scrollTo(0, state.scrollY || 0);
})();
