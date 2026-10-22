// 메타 정보 입력 폼 HTML 템플릿 (vscode 비의존). 값은 모두 여기서 이스케이프한다.
import type { MetaFormValues } from '../data/metaForm';
import { currentLanguage, t } from '../i18n';
import { contentSecurityPolicy, escapeHtml, scriptTags, type WebviewResources } from './html';

export interface MetaFormViewModel {
  /** 화면 제목 (예: "논문 추가 — Few-Shot Learning") */
  heading: string;
  /** 제목 아래 설명 (예: 파일 경로) */
  subheading?: string;
  mode: 'add' | 'edit';
  values: MetaFormValues;
}

const sources = (): { value: string; label: string }[] => [
  { value: 'arxiv', label: t().metaForm.sourceArxiv },
  { value: 'pdf', label: t().metaForm.sourcePdf },
  { value: 'manual', label: t().metaForm.sourceManual },
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
  const m = t().metaForm;
  const options = sources().map(
    (s) => `<option value="${s.value}"${s.value === v.source ? ' selected' : ''}>${escapeHtml(s.label)}</option>`,
  ).join('');
  const paperIdField =
    vm.mode === 'add'
      ? field('paperId', m.paperId, input('paperId', v.paperId, `placeholder="${escapeHtml(m.paperIdPlaceholder)}"`), m.paperIdHint)
      : '';

  return `<!DOCTYPE html>
<html lang="${currentLanguage()}">
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
    ${field('title', m.title, input('title', v.title))}
    ${field('authors', m.authors, input('authors', v.authors), m.authorsHint)}
    <div class="row">
      ${field('year', m.year, input('year', v.year, 'inputmode="numeric" maxlength="4"'))}
      ${field('citation', m.citation, input('citation', v.citation, 'inputmode="numeric"'), m.citationHint)}
    </div>
    ${field('source', m.source, `<select id="f-source" name="source">${options}</select>`)}
    ${field('url', 'URL', input('url', v.url, 'placeholder="https://"'))}
    ${field('abstract', m.abstract, `<textarea id="f-abstract" name="abstract" rows="10">${escapeHtml(v.abstract)}</textarea>`)}
    ${paperIdField}
    <div class="toolbar actions">
      <button type="submit" class="primary" id="save">${escapeHtml(m.save)}</button>
      <button type="button" id="cancel">${escapeHtml(m.cancel)}</button>
    </div>
  </form>
  ${scriptTags(res)}
</body>
</html>`;
}
