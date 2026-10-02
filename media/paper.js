// Paper 패널 webview 스크립트: 버튼·링크 클릭을 확장에 전달하고, Reload 후 스크롤 위치를 유지한다.
(function () {
  const vscode = acquireVsCodeApi();
  const paperId = document.body.dataset.paperId;

  const state = vscode.getState();
  if (state && state.paperId === paperId && typeof state.scrollY === 'number') {
    window.scrollTo(0, state.scrollY);
  }

  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => vscode.setState({ paperId, scrollY: window.scrollY }), 100);
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const button = target.closest('[data-action]');
    if (button) {
      event.preventDefault();
      vscode.postMessage({ type: button.getAttribute('data-action') });
      return;
    }
    const link = target.closest('a[href]');
    if (!link) {
      return;
    }
    event.preventDefault();
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      const el = document.getElementById(decodeURIComponent(href.slice(1)));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    vscode.postMessage({ type: 'openLink', href });
  });
})();
