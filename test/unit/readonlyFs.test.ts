import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataError } from '../../src/data/errors';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';

const DATA = path.resolve(__dirname, '../fixtures/sample-data');

describe('nodeReadonlyFs', () => {
  it('디렉터리 항목을 종류와 함께 읽는다', async () => {
    const entries = await nodeReadonlyFs.readDir(DATA);
    expect(entries).toContainEqual({ name: 'Few-Shot_Learning', isDirectory: true, isFile: false });
    expect(entries).toContainEqual({ name: 'notes.txt', isDirectory: false, isFile: true });
  });

  it('UTF-8 텍스트를 읽는다', async () => {
    const text = await nodeReadonlyFs.readText(path.join(DATA, 'Broken_Data/valid_paper.md'));
    expect(text).toContain('인라인 수식');
  });

  it('stat으로 파일과 폴더를 구분한다', async () => {
    expect((await nodeReadonlyFs.stat(DATA)).isDirectory).toBe(true);
    expect((await nodeReadonlyFs.stat(path.join(DATA, 'notes.txt'))).isFile).toBe(true);
  });

  it('없는 경로는 DataError(notFound)', async () => {
    const p = path.join(DATA, 'no_such_file.json');
    await expect(nodeReadonlyFs.readText(p)).rejects.toMatchObject({ name: 'DataError', kind: 'notFound', path: p });
    await expect(nodeReadonlyFs.stat(p)).rejects.toBeInstanceOf(DataError);
  });

  it('파일을 디렉터리로 읽으면 DataError(notDirectory)', async () => {
    await expect(nodeReadonlyFs.readDir(path.join(DATA, 'notes.txt'))).rejects.toMatchObject({ kind: 'notDirectory' });
  });
});
