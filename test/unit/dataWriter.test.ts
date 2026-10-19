import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataWriter, type DataWriter } from '../../src/data/dataWriter';
import { copyFixture, type TempData } from './tempData';

let data: TempData;
let enabled: boolean;
let writer: DataWriter;
const at = (...parts: string[]) => path.join(data.root, ...parts);

beforeEach(() => {
  data = copyFixture();
  enabled = true;
  writer = createDataWriter({ root: data.root, isEnabled: () => enabled });
});

afterEach(() => data.cleanup());

describe('DataWriter: 쓰기 설정 (이중 방어)', () => {
  it('꺼져 있으면 writeDisabled로 거부하고 아무것도 만들지 않는다', async () => {
    enabled = false;
    await expect(writer.makeDirectory(at('New_Topic'))).rejects.toMatchObject({ kind: 'writeDisabled' });
    await expect(writer.writeTextAtomic(at('Autoencoder', 'x.json'), '{}')).rejects.toMatchObject({ kind: 'writeDisabled' });
    expect(existsSync(at('New_Topic'))).toBe(false);
    expect(existsSync(at('Autoencoder', 'x.json'))).toBe(false);
  });

  it('호출할 때마다 설정을 다시 확인한다', async () => {
    await writer.makeDirectory(at('A'));
    enabled = false;
    await expect(writer.makeDirectory(at('B'))).rejects.toMatchObject({ kind: 'writeDisabled' });
    expect(existsSync(at('A'))).toBe(true);
    expect(existsSync(at('B'))).toBe(false);
  });
});

describe('DataWriter: 경로 검사', () => {
  it('데이터 폴더 자체는 invalidPath', async () => {
    await expect(writer.removeEmptyDirectory(data.root)).rejects.toMatchObject({ kind: 'invalidPath' });
    await expect(writer.writeTextAtomic(data.root, 'x')).rejects.toMatchObject({ kind: 'invalidPath' });
    expect(existsSync(data.root)).toBe(true);
  });

  it.each([
    ['데이터 폴더 밖', () => path.join(data.root, '..', 'outside.json')],
    ['상대 경로로 빠져나감', () => at('Autoencoder', '..', '..', 'outside.json')],
    ['주제 폴더의 하위 폴더', () => at('Autoencoder', 'sub', 'x.json')],
  ])('%s는 invalidPath', async (_name, target) => {
    await expect(writer.writeTextAtomic(target(), 'x')).rejects.toMatchObject({ kind: 'invalidPath' });
    expect(existsSync(target())).toBe(false);
  });

  it('이동 대상도 검사한다', async () => {
    await expect(writer.move(at('Autoencoder'), path.join(data.root, '..', 'Moved'))).rejects.toMatchObject({ kind: 'invalidPath' });
    expect(existsSync(at('Autoencoder'))).toBe(true);
  });
});

describe('DataWriter: writeTextAtomic', () => {
  it('UTF-8(BOM 없음)로 쓰고, 기존 파일을 덮어쓰며, 임시 파일을 남기지 않는다', async () => {
    const file = at('Autoencoder', 'new_paper.md');
    await writer.writeTextAtomic(file, '# 첫 번째');
    await writer.writeTextAtomic(file, '# 두 번째 ✨');
    const bytes = readFileSync(file);
    expect(bytes[0]).not.toBe(0xef); // BOM 없음
    expect(bytes.toString('utf8')).toBe('# 두 번째 ✨');
    expect(readdirSync(at('Autoencoder')).filter((n) => n.startsWith('.'))).toEqual([]);
  });

  it('폴더가 없으면 notFound, 임시 파일을 남기지 않는다', async () => {
    await expect(writer.writeTextAtomic(at('No_Such_Topic', 'a.json'), '{}')).rejects.toMatchObject({ kind: 'notFound' });
    expect(existsSync(at('No_Such_Topic'))).toBe(false);
  });
});

describe('DataWriter: 폴더와 이름 변경', () => {
  it('makeDirectory: 이미 있으면 conflict', async () => {
    await writer.makeDirectory(at('딥러닝_입문'));
    expect(existsSync(at('딥러닝_입문'))).toBe(true);
    await expect(writer.makeDirectory(at('Autoencoder'))).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('move: 대상이 있으면 conflict이고 원본은 그대로다', async () => {
    await expect(writer.move(at('Autoencoder'), at('Broken_Data'))).rejects.toMatchObject({ kind: 'conflict' });
    expect(existsSync(at('Autoencoder'))).toBe(true);
  });

  it('move: 폴더 이름을 바꾸면 안의 파일은 그대로 옮겨진다', async () => {
    const before = readdirSync(at('Autoencoder')).sort();
    await writer.move(at('Autoencoder'), at('Auto_Encoder'));
    expect(existsSync(at('Autoencoder'))).toBe(false);
    expect(readdirSync(at('Auto_Encoder')).sort()).toEqual(before);
  });

  it('move: 대소문자만 바꿀 수 있다', async () => {
    await writer.move(at('Autoencoder'), at('AutoEncoder'));
    expect(readdirSync(data.root)).toContain('AutoEncoder');
    expect(readdirSync(data.root)).not.toContain('Autoencoder');
    expect(readdirSync(data.root).filter((n) => n.includes('renaming'))).toEqual([]);
  });

  it('removeEmptyDirectory: 비어 있지 않으면 conflict, 비어 있으면 지운다', async () => {
    await expect(writer.removeEmptyDirectory(at('Autoencoder'))).rejects.toMatchObject({ kind: 'conflict' });
    await writer.makeDirectory(at('Empty'));
    await writer.removeEmptyDirectory(at('Empty'));
    expect(existsSync(at('Empty'))).toBe(false);
  });

  it('removeFile: 지우고, 없으면 notFound', async () => {
    await writer.removeFile(at('Broken_Data', 'valid_paper.txt'));
    expect(existsSync(at('Broken_Data', 'valid_paper.txt'))).toBe(false);
    await expect(writer.removeFile(at('Broken_Data', 'valid_paper.txt'))).rejects.toMatchObject({ kind: 'notFound' });
  });
});
