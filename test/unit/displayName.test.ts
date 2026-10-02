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
});

describe('isValidTopicName', () => {
  it.each(['AI_Healthcare', 'Few-Shot_Learning', 'U-Net', 'GPT', 'Blood_Pressure_Estimation_PPG'])(
    '허용: %s',
    (name) => expect(isValidTopicName(name)).toBe(true),
  );

  it.each(['.git', '.hidden', 'Invalid Topic Name', '', '주제', 'a.b'])(
    '거부: "%s"',
    (name) => expect(isValidTopicName(name)).toBe(false),
  );
});
