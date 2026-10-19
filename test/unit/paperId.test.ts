import { describe, expect, it } from 'vitest';
import { cleanText, isValidPaperId, slugifyPaperTitle } from '../../src/data/paperId';
import { resolvePaperId } from '../../src/data/paperOps';

describe('slugifyPaperTitle (형식 명세 §7.1)', () => {
  it.each([
    ['Learning Activation Functions to Improve Deep Neural Networks', 'learning_activation_functions_to_improve_deep_neural_networks'],
    ['A Closer Look at Few-shot Classification', 'a_closer_look_at_few_shot_classification'],
    ["Before You <think>, Monitor: Flavell's Framework", 'before_you_think_monitor_flavell_s_framework'],
    ['  --Edge__Case--  ', 'edge_case'],
    ['딥러닝 입문', ''],
    ['GPT-4 기술 보고서', 'gpt_4'],
  ])('%s → %s', (title, slug) => expect(slugifyPaperTitle(title)).toBe(slug));
});

describe('isValidPaperId', () => {
  it.each(['korean_paper_2024', 'a', 'x1_y2'])('허용: %s', (id) => expect(isValidPaperId(id)).toBe(true));
  it.each(['', 'Upper', '_lead', 'trail_', 'a__b', 'a-b', '한글', 'a.json'])('거부: "%s"', (id) => expect(isValidPaperId(id)).toBe(false));
});

describe('cleanText', () => {
  it('연속 공백을 하나로, 앞뒤 공백 제거', () => {
    expect(cleanText('  Few-Shot\n  Learning\t ')).toBe('Few-Shot Learning');
  });
});

describe('resolvePaperId (형식 명세 §7.3)', () => {
  it('제목 slug가 있으면 그것을 쓰고 입력값은 무시한다', () => {
    expect(resolvePaperId('Attention Is All You Need', 'other_id')).toBe('attention_is_all_you_need');
  });

  it('slug가 비면 slug 형식의 입력값만 쓴다', () => {
    expect(resolvePaperId('딥러닝 입문', 'deep_learning_intro')).toBe('deep_learning_intro');
    expect(resolvePaperId('딥러닝 입문', 'Deep Learning')).toBeUndefined();
    expect(resolvePaperId('딥러닝 입문')).toBeUndefined();
  });
});
