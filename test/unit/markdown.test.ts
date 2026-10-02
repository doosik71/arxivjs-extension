import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PaperRenderer, slugify, stripLeadingHeader } from '../../src/render/markdown';

const DATA = path.resolve(__dirname, '../fixtures/sample-data');
const fixture = (rel: string) => fs.readFileSync(path.join(DATA, rel), 'utf8');
const renderer = new PaperRenderer();
const render = (md: string) => renderer.render(md);

describe('수식 (KaTeX)', () => {
  it('인라인 $...$, 블록 $$...$$을 렌더링한다', () => {
    const { html } = render('인라인 $E=mc^2$ 수식\n\n$$\n\\int_0^1 x^2 \\, dx\n$$\n');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('$E=mc^2$');
  });

  it('KaTeX가 모르는 명령은 예외 없이 빨간 원문으로 남긴다', () => {
    const { html } = render('정의되지 않은 매크로 $\\miniI$ 테스트');
    expect(html).toContain('\\miniI');
    expect(html).toContain('#cc0000');
  });

  it('수식 문법 오류는 예외 없이 katex-error로 남긴다', () => {
    expect(render('닫히지 않은 $x^{$ 수식').html).toContain('katex-error');
  });

  it('수식 안의 한글은 그대로 그리고 콘솔 경고를 내지 않는다 (strict: ignore)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { html } = render('정확도 $x_{최대} = 1$ 이다');
      expect(html).toContain('class="katex"');
      expect(html).not.toContain('katex-error');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('fixture 문서의 수식을 모두 예외 없이 렌더링한다', () => {
    const { html } = render(fixture('Cosine_Similarity/a_closer_look_at_few_shot_classification.md'));
    expect(html.match(/class="katex"/g)?.length ?? 0).toBeGreaterThan(10);
  });
});

describe('HTML처럼 보이는 텍스트', () => {
  it('<think> 등은 태그로 해석하지 않고 글자 그대로 보인다', () => {
    const { html } = render('본문 <think>reasoning</think> 과 <kw>키워드</kw>');
    expect(html).toContain('&lt;think&gt;reasoning&lt;/think&gt;');
    expect(html).toContain('&lt;kw&gt;');
    expect(html).not.toMatch(/<think>/);
  });

  it('<script>, 이벤트 속성도 실행되지 않는 텍스트가 된다', () => {
    const { html } = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|<img/i);
  });

  it('fixture 문서의 <think>', () => {
    const md = fixture('Large_Language_Model/before_you_think_monitor_implementing_flavell_s_metacognitive_framework_in_llms.md');
    const { html } = render(md);
    expect(md).toContain('<think>');
    expect(html).toContain('&lt;think&gt;');
    expect(html).not.toContain('<think>');
  });
});

describe('표, 이미지, 링크', () => {
  it('GFM 표', () => {
    const { html } = render(fixture('Few-Shot_Learning/learning_to_learn_neural_networks.md'));
    expect(html).toContain('<table>');
    expect(html).toMatch(/<th[ >]/);
  });

  it('원격 https 이미지', () => {
    const { html } = render(
      fixture('Alzheimer_Detection/attentionms_net_an_attention_enhanced_multi_scale_framework_for_alzheimer_s_disease_classification_with_subject_level_validation.md'),
    );
    expect(html).toMatch(/<img src="https:\/\/www\.mdpi\.com\/[^"]+" alt="Figure 1\./);
  });

  it('http(s) 링크와 URL 자동 링크', () => {
    const { html } = render('[arXiv](https://arxiv.org/abs/1) 와 http://example.com/x');
    expect(html).toContain('<a href="https://arxiv.org/abs/1">arXiv</a>');
    expect(html).toContain('<a href="http://example.com/x">');
  });

  it.each(['javascript:alert(1)', 'file:///C:/secret.txt', 'command:workbench.action.quit', 'vscode://x'])(
    '위험한 스킴은 링크로 만들지 않는다: %s',
    (url) => {
      expect(render(`[x](${url})`).html).not.toContain('<a ');
    },
  );
});

describe('제목 id와 목차', () => {
  it('H2를 목차로 모으고, 이모지는 id에서 뺀다', () => {
    const { html, headings } = render('# Title\n\n## 🧩 Problem to Solve\n\n### Sub\n\n## ✨ Key Contributions\n');
    expect(headings).toEqual([
      { level: 2, text: '🧩 Problem to Solve', id: 'problem-to-solve' },
      { level: 2, text: '✨ Key Contributions', id: 'key-contributions' },
    ]);
    expect(html).toContain('<h2 id="problem-to-solve">');
    expect(html).toContain('<h3 id="sub">');
  });

  it('같은 제목은 번호를 붙여 id가 겹치지 않게 한다', () => {
    const { html } = render('## 결과\n\n## 결과\n\n## 결과\n');
    expect(html).toContain('id="결과"');
    expect(html).toContain('id="결과-1"');
    expect(html).toContain('id="결과-2"');
  });

  it('slugify: 한글 유지, 기호 제거', () => {
    expect(slugify('📊 실험 결과 (Results)')).toBe('실험-결과-results');
    expect(slugify('🎯')).toBe('section');
  });

  it('fixture 문서의 H2 섹션', () => {
    const { headings } = render(fixture('Cosine_Similarity/a_closer_look_at_few_shot_classification.md'));
    expect(headings.length).toBeGreaterThanOrEqual(3);
    expect(headings[0].text).toBe('🧩 Problem to Solve');
  });
});

describe('stripLeadingHeader', () => {
  it('첫 H1과 "저자 (연도)" 줄을 지운다', () => {
    const md = '# A CLOSER LOOK\n\nWei-Yu Chen, Jia-Bin Huang (2019)\n\n## 🧩 Problem\n\n본문';
    expect(stripLeadingHeader(md)).toBe('## 🧩 Problem\n\n본문');
  });

  it('저자 줄이 없으면 H1만 지운다', () => {
    expect(stripLeadingHeader('# Title\n\n## Section\n')).toBe('## Section\n');
  });

  it('H1 앞에 내용이 있으면 그대로 둔다', () => {
    const md = '머리말\n\n# Title\n';
    expect(stripLeadingHeader(md)).toBe(md);
  });

  it('렌더 결과에서 문서 제목 H1이 빠진다', () => {
    const { html } = renderer.render(fixture('Cosine_Similarity/a_closer_look_at_few_shot_classification.md'), { stripHeader: true });
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('Wei-Yu Chen');
  });
});

describe('renderCached', () => {
  it('원문이 같으면 같은 결과 객체, 바뀌면 다시 렌더링', () => {
    const r = new PaperRenderer();
    const a = r.renderCached('k', '## A');
    expect(r.renderCached('k', '## A')).toBe(a);
    const b = r.renderCached('k', '## B');
    expect(b).not.toBe(a);
    expect(b.headings[0].text).toBe('B');
  });
});

describe('renderInline (초록)', () => {
  it('수식은 렌더링하고 블록 태그는 만들지 않는다', () => {
    const html = renderer.renderInline('accuracy $a^2$ on <b>CUB</b>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<p>');
  });
});
