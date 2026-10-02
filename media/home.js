// 홈(주제 목록) webview 스크립트: 주제 목록 그리기, 필터·정렬, 주제 열기
// 데이터 문자열은 모두 textContent로 넣는다.
(function () {
  const vscode = acquireVsCodeApi();
  const data = JSON.parse(document.getElementById('home-data').textContent);
  const model = window.ArxivjsTopicModel; // media/topicModel.js
  const listEl = document.getElementById('topics');
  const filterEl = document.getElementById('filter');
  const visibleEl = document.getElementById('visible');
  const emptyEl = document.getElementById('empty');
  const numberFormat = new Intl.NumberFormat('en-US');

  // 같은 데이터 폴더를 다시 그릴 때(Reload) 필터·정렬·스크롤을 유지한다.
  const saved = vscode.getState();
  const state = saved && saved.folder === data.folder ? saved : { folder: data.folder, filter: '', sort: 'name', scrollY: 0 };
  const saveState = () => vscode.setState(state);

  const items = data.rows.map((topic) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'topic';
    button.dataset.id = topic.id;
    button.title = topic.id;
    const name = document.createElement('span');
    name.className = 'topic-label';
    name.textContent = topic.label;
    const count = document.createElement('span');
    count.className = 'topic-count';
    button.append(name, count);
    const li = document.createElement('li');
    li.append(button);
    const item = { topic, li, countEl: count };
    setCount(item, topic.count);
    return item;
  });
  const byId = new Map(items.map((it) => [it.topic.id, it]));

  // ---- 논문 수: 첫 화면 뒤에 확장이 비동기로 세어 묶음으로 보낸다 ----
  const summaryEl = document.getElementById('summary');
  let countsDone = items.every((it) => it.topic.count !== undefined);

  /** count: 숫자, null(세지 못함), undefined(아직 모름) */
  function setCount(item, count) {
    item.topic.count = count === null ? undefined : count;
    item.countEl.textContent = count === undefined ? '…' : count === null ? '–' : numberFormat.format(count);
    item.countEl.classList.toggle('pending', count === undefined);
  }

  function updateSummary() {
    if (!data.folder) {
      return;
    }
    const total = items.reduce((sum, it) => sum + (it.topic.count || 0), 0);
    summaryEl.textContent =
      items.length === 0
        ? '주제 0개'
        : countsDone
          ? `주제 ${items.length}개 · 논문 ${numberFormat.format(total)}편`
          : `주제 ${items.length}개 · 논문 수 세는 중…`;
  }

  let resortTimer;
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'counts') {
      return;
    }
    for (const [id, count] of Object.entries(msg.counts || {})) {
      const it = byId.get(id);
      if (it) {
        setCount(it, count);
      }
    }
    countsDone = countsDone || Boolean(msg.done);
    updateSummary();
    if (state.sort === 'count') {
      // 개수가 도착할 때마다 순서를 바꾸면 화면이 계속 흔들리므로 잠깐 모아서 다시 정렬한다.
      clearTimeout(resortTimer);
      resortTimer = setTimeout(render, msg.done ? 0 : 150);
    }
  });

  function visibleItems() {
    const tokens = model.tokenize(state.filter);
    return items.filter((it) => model.matchesTopic(it.topic, tokens));
  }

  function render() {
    const cmp = model.topicComparator(state.sort);
    const sorted = [...items].sort((a, b) => cmp(a.topic, b.topic));
    const shown = new Set(visibleItems());
    const fragment = document.createDocumentFragment();
    for (const it of sorted) {
      it.li.hidden = !shown.has(it);
      fragment.append(it.li);
    }
    listEl.append(fragment);
    visibleEl.textContent = shown.size === items.length ? '' : `${shown.size} / ${items.length}개`;
    emptyEl.hidden = shown.size > 0 || items.length === 0;
    for (const b of document.querySelectorAll('.sort')) {
      const active = b.dataset.sort === state.sort;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
  }

  const openTopic = (id) => vscode.postMessage({ type: 'openTopic', id });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const topic = target.closest('.topic');
    if (topic) {
      openTopic(topic.dataset.id);
      return;
    }
    const sort = target.closest('.sort');
    if (sort) {
      state.sort = sort.dataset.sort;
      saveState();
      render();
      return;
    }
    const action = target.closest('[data-action]');
    if (action) {
      vscode.postMessage({ type: action.getAttribute('data-action') });
    }
  });

  let filterTimer;
  filterEl.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filter = filterEl.value;
      saveState();
      render();
    }, 60);
  });

  // Enter: 보이는 첫 주제를 연다. 아래 화살표: 첫 주제로 포커스를 옮긴다.
  filterEl.addEventListener('keydown', (event) => {
    state.filter = filterEl.value;
    const cmp = model.topicComparator(state.sort);
    const first = visibleItems().sort((a, b) => cmp(a.topic, b.topic))[0];
    if (event.key === 'Enter' && first) {
      event.preventDefault();
      openTopic(first.topic.id);
    } else if (event.key === 'ArrowDown' && first) {
      event.preventDefault();
      first.li.querySelector('button').focus();
    }
  });

  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      state.scrollY = window.scrollY;
      saveState();
    }, 100);
  });

  filterEl.value = state.filter;
  render();
  updateSummary();
  window.scrollTo(0, state.scrollY || 0);
  if (items.length > 0) {
    filterEl.focus();
  }
  // 준비되기 전에 보낸 개수는 사라졌을 수 있으므로, 지금까지 센 것을 다시 받는다.
  vscode.postMessage({ type: 'ready' });
})();
