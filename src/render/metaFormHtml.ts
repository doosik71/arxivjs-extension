// 메타 정보 입력 폼 HTML 템플릿 (vscode 비의존). 값은 모두 여기서 이스케이프한다.
import type { MetaFormValues } from '../data/metaForm';
import { contentSecurityPolicy, escapeHtml, scriptTags, type WebviewResources } from './html';

export interface MetaFormViewModel {
  /** 화면 제목 (예: "논문 추가 — Few-Shot Learning") */
  heading: string;
  /** 제목 아래 설명 (예: 파일 경로) */
  subheading?: string;
  mode: 'add' | 'edit';
  values: MetaFormValues;
}

const SOURCES: { value: string; label: string }[] = [
  { value: 'arxiv', label: 'arxiv — arXiv 논문 (URL은 abs 주소)' },
  { value: 'pdf', label: 'pdf — PDF URL로 추가한 논문 (URL 필수)' },
  { value: 'manual', label: 'manual — 직접 입력한 논문 (URL은 참고용)' },
];

function field(name: keyof MetaFormValues, label: string, control: string, hint = ''): string {
  return (
    `<div class="field" data-field="${name}">` +
    `<label for="f-${name}">${escapeHtml(label)}</label>` +
    control +
    (hint ? `<p class="hint">${escapeHtml(hint)}</p>` : '') +
    `<p class="error" id="e-${name}" role="alert" hidden></p>` +
    `</div>`
  );
}

const input = (name: keyof MetaFormValues, value: string, extra = '') =>
  `<input type="text" id="f-${name}" name="${name}" value="${escapeHtml(value)}" autocomplete="off" ${extra}>`;

export function buildMetaFormHtml(vm: MetaFormViewModel, res: WebviewResources): string {
  const styles = res.styleUris.map((u) => `<link rel="stylesheet" href="${escapeHtml(u)}">`).join('\n  ');
  const v = vm.values;
  const options = SOURCES.map(
    (s) => `<option value="${s.value}"${s.value === v.source ? ' selected' : ''}>${escapeHtml(s.label)}</option>`,
  ).join('');
  const paperIdField =
    vm.mode === 'add'
      ? field('paperId', '파일 이름 (선택)', input('paperId', v.paperId, 'placeholder="예: korean_paper_2024"'), '파일 이름은 제목으로 자동으로 만든다. 제목에 영문이나 숫자가 하나도 없을 때만 입력한다 (a-z, 0-9, _).')
      : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(res.cspSource, res.nonce)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styles}
  <title>${escapeHtml(vm.heading)}</title>
</head>
<body>
  <h1 class="form-title">${escapeHtml(vm.heading)}</h1>
  ${vm.subheading ? `<p class="form-subtitle">${escapeHtml(vm.subheading)}</p>` : ''}
  <div class="notice notice-error" id="message" role="alert" hidden></div>
  <form id="meta-form" novalidate>
    ${field('title', '제목 *', input('title', v.title))}
    ${field('authors', '저자 *', input('authors', v.authors), '쉼표로 구분한다. 예: Wei-Yu Chen, Yen-Cheng Liu')}
    <div class="row">
      ${field('year', '연도 *', input('year', v.year, 'inputmode="numeric" maxlength="4"'))}
      ${field('citation', '인용 수', input('citation', v.citation, 'inputmode="numeric"'), '모르면 비워 둔다.')}
    </div>
    ${field('source', '출처', `<select id="f-source" name="source">${options}</select>`)}
    ${field('url', 'URL', input('url', v.url, 'placeholder="https://"'))}
    ${field('abstract', '초록', `<textarea id="f-abstract" name="abstract" rows="10">${escapeHtml(v.abstract)}</textarea>`)}
    ${paperIdField}
    <div class="toolbar actions">
      <button type="submit" class="primary" id="save">저장</button>
      <button type="button" id="cancel">취소</button>
    </div>
  </form>
  ${scriptTags(res)}
</body>
</html>`;
}
