// 탭 아이콘: 홈·Topic·Paper가 서로 다르고, 라이트·다크 테마용이 모두 있어야 한다.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ICONS = path.resolve(__dirname, '../../media/icons');
const NAMES = ['home', 'topic', 'paper'] as const;
const read = (name: string, theme: string) => fs.readFileSync(path.join(ICONS, `${name}-${theme}.svg`), 'utf8');

describe('탭 아이콘', () => {
  it.each(NAMES)('%s: 라이트·다크 SVG가 있고 색만 다르다', (name) => {
    const light = read(name, 'light');
    const dark = read(name, 'dark');
    expect(light).toMatch(/^<svg [^>]*viewBox="0 0 16 16"/);
    expect(light).not.toBe(dark);
    expect(light.replace(/#[0-9A-Fa-f]{6}/g, '')).toBe(dark.replace(/#[0-9A-Fa-f]{6}/g, ''));
  });

  it('세 아이콘의 모양이 모두 다르다', () => {
    const shapes = NAMES.map((n) => read(n, 'light'));
    expect(new Set(shapes).size).toBe(3);
  });
});
