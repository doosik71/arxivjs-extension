// 메타 정보 입력 폼 webview 스크립트: 값을 확장에 보내고, 확장이 돌려준 오류를 필드 옆에 보여준다.
// 값 검사는 확장(src/data/metaForm.ts)이 한다.
(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('meta-form');
  const message = document.getElementById('message');
  const buttons = form.querySelectorAll('button');
  const FIELDS = ['title', 'authors', 'year', 'url', 'abstract', 'citation', 'source', 'paperId'];

  function values() {
    const out = {};
    for (const name of FIELDS) {
      const el = form.elements.namedItem(name);
      out[name] = el ? el.value : '';
    }
    return out;
  }

  function showErrors(errors, text) {
    let first;
    for (const name of FIELDS) {
      const el = document.getElementById('e-' + name);
      if (!el) {
        continue;
      }
      const msg = errors && errors[name];
      el.textContent = msg || '';
      el.hidden = !msg;
      const input = form.elements.namedItem(name);
      if (input) {
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (msg && !first) {
          first = input;
        }
      }
    }
    message.textContent = text || '';
    message.hidden = !text;
    if (first) {
      first.focus();
    }
  }

  function setBusy(busy) {
    for (const b of buttons) {
      b.disabled = busy;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setBusy(true);
    vscode.postMessage({ type: 'submit', values: values() });
  });

  document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'result') {
      setBusy(false);
      showErrors(msg.errors, msg.message);
    }
  });

  const firstInput = document.getElementById('f-title');
  if (firstInput) {
    firstInput.focus();
  }
})();
