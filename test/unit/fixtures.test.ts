// test/fixtures/sample-data가 DEV-PLAN §2의 경계 사례를 모두 담고 있는지 확인한다.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const DATA = path.resolve(__dirname, '../fixtures/sample-data');
const exists = (p: string) => fs.existsSync(path.join(DATA, p));
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const listJson = (topic: string) => fs.readdirSync(path.join(DATA, topic)).filter((f) => f.endsWith('.json'));

describe('fixture: sample-data', () => {
  it('하이픈 폴더, 규칙 위반 폴더, dot 폴더, 최상위 파일이 있다', () => {
    expect(exists('Few-Shot_Learning')).toBe(true);
    expect(exists('Invalid Topic Name')).toBe(true);
    expect(exists('.hidden')).toBe(true);
    expect(exists('notes.txt')).toBe(true);
  });

  it('json만 있는 논문, md만 있는 논문이 있다', () => {
    expect(exists('Few-Shot_Learning/domain_agnostic_few_shot_classification_by_learning_disparate_modulators.json')).toBe(true);
    expect(exists('Few-Shot_Learning/domain_agnostic_few_shot_classification_by_learning_disparate_modulators.md')).toBe(false);
    expect(exists('Surgical_Instrument_Segmentation/aHR0cDovL2FyeGl2Lm9yZy9hYnMvMTgwNC4wMzk5OXYz.md')).toBe(true);
    expect(listJson('Surgical_Instrument_Segmentation')).toEqual([]);
  });

  it('깨진 JSON이 있다', () => {
    expect(() => readJson('Broken_Data/broken_json_paper.json')).toThrow();
  });

  it('citation 없는 메타, source 있는 메타가 있다', () => {
    expect(readJson('Agentic_Reasoning/agentic_large_language_models_a_survey.json').citation).toBeUndefined();
    const sources = ['Alzheimer_Detection', 'Autoencoder'].flatMap((t) =>
      listJson(t).map((f) => readJson(path.join(t, f)).source),
    );
    expect(sources).toEqual(expect.arrayContaining(['pdf', 'manual']));
  });

  it('무시 대상 파일(.txt, .hlt, .bak, .md.bak)이 있다', () => {
    for (const f of ['valid_paper.txt', 'valid_paper.bak', 'valid_paper.md.bak']) {
      expect(exists(path.join('Broken_Data', f))).toBe(true);
    }
    expect(exists('Cosine_Similarity/low_shot_learning_with_imprinted_weights.hlt')).toBe(true);
  });

  it('렌더링 사례: 수식, 표, <think> 텍스트, 원격 이미지', () => {
    const md = (p: string) => fs.readFileSync(path.join(DATA, p), 'utf8');
    expect(md('Broken_Data/valid_paper.md')).toMatch(/\$\$/);
    expect(md('Few-Shot_Learning/learning_to_learn_neural_networks.md')).toMatch(/^\|.*\|\s*$/m);
    expect(md('Large_Language_Model/before_you_think_monitor_implementing_flavell_s_metacognitive_framework_in_llms.md')).toContain('<think>');
    expect(
      md('Alzheimer_Detection/attentionms_net_an_attention_enhanced_multi_scale_framework_for_alzheimer_s_disease_classification_with_subject_level_validation.md'),
    ).toMatch(/!\[[^\]]*\]\(https:/);
  });
});
