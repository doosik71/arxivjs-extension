import { describe, expect, it } from 'vitest';
import { isValidTopicName, toDisplayName } from '../../src/util/displayName';

describe('toDisplayName', () => {
  it('언더스코어를 공백으로 바꾼다', () => {
    expect(toDisplayName('Large_Language_Model')).toBe('Large Language Model');
  });

  it('하이픈은 그대로 둔다', () => {
    expect(toDisplayName('Few-Shot_Learning')).toBe('Few-Shot Learning');
    expect(toDisplayName('U-Net')).toBe('U-Net');
  });

  it('연속 공백을 하나로 줄이고 앞뒤 공백을 지운다', () => {
    expect(toDisplayName('_A__B _C_')).toBe('A B C');
    expect(toDisplayName('딥러닝_(Deep_Learning)')).toBe('딥러닝 (Deep Learning)');
  });
});

describe('isValidTopicName', () => {
  it.each([
    'AI_Healthcare',
    'Few-Shot_Learning',
    'U-Net',
    'GPT',
    'Blood_Pressure_Estimation_PPG',
    'Topic With Spaces',
    '주제',
    '딥러닝_(Deep_Learning)',
  ])(
    '허용: %s',
    (name) => expect(isValidTopicName(name)).toBe(true),
  );

  it.each(['.git', '.hidden', 'Invalid.Topic', '', '   ', '___', 'a/b', 'a[b]', 'ㄱ'])(
    '거부: "%s"',
    (name) => expect(isValidTopicName(name)).toBe(false),
  );
});
