import { describe, expect, it } from 'vitest';
import { mapLimit } from '../../src/util/mapLimit';

describe('mapLimit', () => {
  it('순서를 유지하고 동시 실행 수를 제한한다', async () => {
    let active = 0;
    let max = 0;
    const result = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (n) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30, 0]);
    expect(max).toBe(2);
  });

  it('빈 배열', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
