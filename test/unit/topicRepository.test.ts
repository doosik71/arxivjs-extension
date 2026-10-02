import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import { TopicRepository } from '../../src/data/topicRepository';
import type { Logger } from '../../src/util/logger';
import { MemoryFs, ROOT } from './memoryFs';

const DATA = path.resolve(__dirname, '../fixtures/sample-data');
const spyLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('TopicRepository (fixture)', () => {
  it('규칙에 맞는 폴더만 표시 이름 순으로 돌려준다', async () => {
    const topics = await new TopicRepository(DATA, nodeReadonlyFs, spyLogger()).list();

    expect(topics.map((t) => t.id)).toEqual([
      'Agentic_Reasoning',
      'Alzheimer_Detection',
      'Autoencoder',
      'Broken_Data',
      'Cosine_Similarity',
      'Few-Shot_Learning',
      'Large_Language_Model',
      'Surgical_Instrument_Segmentation',
    ]);
    expect(topics.find((t) => t.id === 'Few-Shot_Learning')).toEqual({
      id: 'Few-Shot_Learning',
      label: 'Few-Shot Learning',
      path: path.join(DATA, 'Few-Shot_Learning'),
    });
  });

  it('규칙 위반 폴더는 경고하고, dot 폴더와 파일은 조용히 제외한다', async () => {
    const log = spyLogger();
    await new TopicRepository(DATA, nodeReadonlyFs, log).list();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid Topic Name'));
  });

  it('데이터 폴더가 없으면 DataError(notFound)', async () => {
    const repo = new TopicRepository(path.join(DATA, 'no_such_dir'), nodeReadonlyFs, spyLogger());
    await expect(repo.list()).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('데이터 폴더가 파일이면 DataError(notDirectory)', async () => {
    const repo = new TopicRepository(path.join(DATA, 'notes.txt'), nodeReadonlyFs, spyLogger());
    await expect(repo.list()).rejects.toMatchObject({ kind: 'notDirectory' });
  });
});

describe('TopicRepository (캐시와 reload)', () => {
  it('reload 전까지는 캐시를 쓰고, reload 후 새 폴더를 반영한다', async () => {
    const fs = new MemoryFs({ 'A_Topic/p.json': '{}' });
    const readDir = vi.spyOn(fs, 'readDir');
    const repo = new TopicRepository(ROOT, fs, spyLogger());

    expect((await repo.list()).map((t) => t.id)).toEqual(['A_Topic']);
    fs.addDir('B-Topic');
    expect((await repo.list()).map((t) => t.id)).toEqual(['A_Topic']);
    expect(readDir).toHaveBeenCalledTimes(1);

    repo.reload();
    expect((await repo.list()).map((t) => t.label)).toEqual(['A Topic', 'B-Topic']);
  });

  it('동시에 호출해도 한 번만 읽는다', async () => {
    const fs = new MemoryFs({ 'A/p.json': '{}' });
    const readDir = vi.spyOn(fs, 'readDir');
    const repo = new TopicRepository(ROOT, fs, spyLogger());
    await Promise.all([repo.list(), repo.list(), repo.get('A')]);
    expect(readDir).toHaveBeenCalledTimes(1);
  });

  it('실패한 결과는 캐시하지 않는다', async () => {
    const fs = new MemoryFs();
    const repo = new TopicRepository(path.join(ROOT, 'later'), fs, spyLogger());
    await expect(repo.list()).rejects.toMatchObject({ kind: 'notFound' });
    fs.addDir('later');
    fs.addDir('later/X');
    expect((await repo.list()).map((t) => t.id)).toEqual(['X']);
  });
});
