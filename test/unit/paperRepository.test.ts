import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PaperSort, Topic } from '../../src/data/models';
import { PaperRepository } from '../../src/data/paperRepository';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import { TopicRepository } from '../../src/data/topicRepository';
import { silentLogger, type Logger } from '../../src/util/logger';
import { json, MemoryFs, ROOT } from './memoryFs';

const DATA = path.resolve(__dirname, '../fixtures/sample-data');
const spyLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

async function fixtureTopic(id: string): Promise<Topic> {
  const topic = await new TopicRepository(DATA, nodeReadonlyFs, silentLogger).get(id);
  if (!topic) {
    throw new Error(`fixture topic not found: ${id}`);
  }
  return topic;
}

const memTopic = (id: string): Topic => ({ id, label: id, path: path.join(ROOT, id) });

describe('PaperRepository (fixture)', () => {
  const repo = new PaperRepository(nodeReadonlyFs, silentLogger, { retryDelayMs: 0 });

  it('json·md 쌍을 묶고 citation → year 순으로 정렬한다', async () => {
    const papers = await repo.list(await fixtureTopic('Few-Shot_Learning'));
    expect(papers.map((p) => [p.stem, p.meta.citation, p.meta.year])).toEqual([
      ['regression_networks_for_meta_learning_few_shot_classification', 11, 2019],
      ['learning_to_learn_neural_networks', 11, 2016],
      ['domain_agnostic_few_shot_classification_by_learning_disparate_modulators', 1, 2019],
    ]);
  });

  it('md가 없는 논문은 mdPath 없이 목록에 남는다', async () => {
    const papers = await repo.list(await fixtureTopic('Few-Shot_Learning'));
    const noMd = papers.find((p) => p.stem.startsWith('domain_agnostic'))!;
    expect(noMd.jsonPath).toBeDefined();
    expect(noMd.mdPath).toBeUndefined();
    expect(await repo.readMarkdown(noMd)).toBeUndefined();
  });

  it('json이 없는 논문은 md 헤더와 base64 파일 이름에서 메타를 만든다', async () => {
    const [paper] = await repo.list(await fixtureTopic('Surgical_Instrument_Segmentation'));
    expect(paper.jsonPath).toBeUndefined();
    expect(paper.meta.title).toBe('Attention U-Net: Learning Where to Look for the Pancreas');
    expect(paper.meta.authors).toMatch(/^Ozan Oktay, /);
    expect(paper.meta.year).toBe(2018);
    expect(paper.meta.url).toBe('http://arxiv.org/abs/1804.03999v3');
    expect(paper.metaError).toBeUndefined();
  });

  it('깨진 json은 metaError와 md 제목으로 남고, 무시 대상 파일은 빠진다', async () => {
    const papers = await repo.list(await fixtureTopic('Broken_Data'));
    expect(papers.map((p) => p.stem).sort()).toEqual(['broken_json_paper', 'valid_paper']);

    const broken = papers.find((p) => p.stem === 'broken_json_paper')!;
    expect(broken.metaError).toBeTruthy();
    expect(broken.meta).toMatchObject({ title: 'BROKEN JSON PAPER', authors: 'Test Author', year: 2024 });
  });

  it('citation이 없는 메타, source 필드를 읽는다', async () => {
    const [noCite] = await repo.list(await fixtureTopic('Agentic_Reasoning'));
    expect(noCite.meta.citation).toBeUndefined();
    const [pdf] = await repo.list(await fixtureTopic('Alzheimer_Detection'));
    expect(pdf.meta.source).toBe('pdf');
    const [manual] = await repo.list(await fixtureTopic('Autoencoder'));
    expect(manual.meta.source).toBe('manual');
  });

  it('md 문서를 읽는다', async () => {
    const papers = await repo.list(await fixtureTopic('Large_Language_Model'));
    expect(await repo.readMarkdown(papers[0])).toContain('<think>');
  });
});

describe('PaperRepository (캐시, reload, 경합)', () => {
  const T = memTopic('T');

  it('reloadTopic 전까지는 캐시를 쓰고, 이후 새 파일을 반영한다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A', citation: 1 }) });
    const repo = new PaperRepository(fs, silentLogger);

    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['a']);
    expect(repo.isLoaded('T')).toBe(true);
    fs.setFile('T/b.json', json({ title: 'B', citation: 2 }));
    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['a']);
    expect(fs.reads('T/a.json')).toBe(1);

    repo.reloadTopic('T');
    expect(repo.isLoaded('T')).toBe(false);
    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['b', 'a']);
  });

  it('reloadAll은 모든 주제의 캐시를 비운다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }), 'U/b.json': json({ title: 'B' }) });
    const repo = new PaperRepository(fs, silentLogger);
    await repo.list(T);
    await repo.list(memTopic('U'));
    repo.reloadAll();
    expect(repo.isLoaded('T') || repo.isLoaded('U')).toBe(false);
  });

  it('정렬 기준은 list를 호출할 때의 설정을 따른다', async () => {
    let mode: PaperSort = 'citation';
    const fs = new MemoryFs({
      'T/old.json': json({ title: 'Old', citation: 100, year: 2000 }),
      'T/new.json': json({ title: 'New', citation: 1, year: 2025 }),
    });
    const repo = new PaperRepository(fs, silentLogger, { sort: () => mode });
    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['old', 'new']);
    mode = 'year';
    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['new', 'old']);
  });

  it('쓰는 도중이라 깨진 json은 한 번 다시 읽어서 복구한다', async () => {
    const partial = '{"title": "A", "auth';
    const fs = new MemoryFs({ 'T/a.json': (n) => (n === 0 ? partial : json({ title: 'A', authors: 'X' })) });
    const repo = new PaperRepository(fs, silentLogger, { retryDelayMs: 0 });
    const [paper] = await repo.list(T);
    expect(paper.metaError).toBeUndefined();
    expect(paper.meta.authors).toBe('X');
    expect(fs.reads('T/a.json')).toBe(2);
  });

  it('재시도해도 깨져 있으면 metaError를 남기고 경고한다', async () => {
    const log = spyLogger();
    const fs = new MemoryFs({ 'T/a.json': '{oops' });
    const repo = new PaperRepository(fs, log, { retryDelayMs: 0 });
    const [paper] = await repo.list(T);
    expect(paper.metaError).toBeTruthy();
    expect(paper.meta.title).toBe('a');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('T/a.json'));
  });

  it('json에 title이 없으면 md 제목을 쓴다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ authors: 'X', citation: 3 }), 'T/a.md': '# From Markdown\n' });
    const [paper] = await new PaperRepository(fs, silentLogger).list(T);
    expect(paper.meta).toMatchObject({ title: 'From Markdown', authors: 'X', citation: 3 });
  });

  it('목록을 읽는 사이 사라진 파일은 목록에서 뺀다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }), 'T/gone.json': json({ title: 'G' }) });
    const readDir = fs.readDir.bind(fs);
    vi.spyOn(fs, 'readDir').mockImplementation(async (p) => {
      const entries = await readDir(p);
      fs.removeFile('T/gone.json'); // readdir 직후 다른 앱이 삭제
      return entries;
    });
    const log = spyLogger();
    const papers = await new PaperRepository(fs, log).list(T);
    expect(papers.map((p) => p.stem)).toEqual(['a']);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('T/gone'));
  });

  it('주제 폴더가 사라졌으면 DataError(notFound), 캐시하지 않는다', async () => {
    const repo = new PaperRepository(new MemoryFs(), silentLogger);
    await expect(repo.list(T)).rejects.toMatchObject({ kind: 'notFound' });
    expect(repo.isLoaded('T')).toBe(false);
  });

  it('md가 목록 이후 사라졌으면 readMarkdown이 DataError(notFound)', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }), 'T/a.md': '# A' });
    const repo = new PaperRepository(fs, silentLogger);
    const [paper] = await repo.list(T);
    fs.removeFile('T/a.md');
    await expect(repo.readMarkdown(paper)).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('json 동시 읽기 수를 concurrency 이하로 제한한다', async () => {
    const files = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`T/p${i}.json`, json({ title: `P${i}` })]));
    const fs = new MemoryFs(files);
    fs.readDelayMs = 2;
    const papers = await new PaperRepository(fs, silentLogger, { concurrency: 4 }).list(T);
    expect(papers).toHaveLength(40);
    expect(fs.maxConcurrentReads).toBeLessThanOrEqual(4);
    expect(fs.maxConcurrentReads).toBeGreaterThan(1);
  });
});

describe('PaperRepository.reloadPaper', () => {
  const T = memTopic('T');

  it('논문 하나만 다시 읽고 캐시된 목록에도 반영한다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A', citation: 1 }), 'T/b.json': json({ title: 'B', citation: 2 }) });
    const repo = new PaperRepository(fs, silentLogger);
    await repo.list(T);

    fs.setFile('T/a.json', json({ title: 'A2', citation: 9 }));
    fs.setFile('T/a.md', '# A2');
    const paper = await repo.reloadPaper(T, 'a');

    expect(paper).toMatchObject({ meta: { title: 'A2', citation: 9 }, mdPath: path.join(ROOT, 'T/a.md') });
    expect((await repo.list(T)).map((p) => p.meta.title)).toEqual(['A2', 'B']);
    expect(fs.reads('T/b.json')).toBe(1);
  });

  it('두 파일이 모두 사라졌으면 undefined를 돌려주고 목록에서 뺀다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }), 'T/b.json': json({ title: 'B' }) });
    const repo = new PaperRepository(fs, silentLogger);
    await repo.list(T);
    fs.removeFile('T/a.json');
    expect(await repo.reloadPaper(T, 'a')).toBeUndefined();
    expect((await repo.list(T)).map((p) => p.stem)).toEqual(['b']);
  });
});

describe('PaperRepository.count', () => {
  const T = memTopic('T');

  it('json을 읽지 않고 폴더 목록만으로 stem 수를 센다 (md만 있는 논문 포함, 무시 대상 제외)', async () => {
    const fs = new MemoryFs({
      'T/a.json': json({ title: 'A' }),
      'T/a.md': '# A',
      'T/b.json': json({ title: 'B' }),
      'T/c.md': '# C',
      'T/a.txt': 'x',
      'T/a.hlt': '{}',
      'T/b.md.bak': 'x',
    });
    const repo = new PaperRepository(fs, silentLogger);
    expect(await repo.count(T)).toBe(3);
    expect(fs.reads('T/a.json') + fs.reads('T/b.json')).toBe(0);
    expect(repo.isLoaded('T')).toBe(false);
  });

  it('목록을 읽은 주제는 목록 길이를 쓴다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }), 'T/b.json': json({ title: 'B' }) });
    const repo = new PaperRepository(fs, silentLogger);
    await repo.list(T);
    fs.setFile('T/c.json', json({ title: 'C' })); // 캐시된 목록 기준이므로 반영되지 않는다
    expect(await repo.count(T)).toBe(2);
  });

  it('reload 전까지 캐시하고, reloadTopic/reloadAll/reloadPaper 후 다시 센다', async () => {
    const fs = new MemoryFs({ 'T/a.json': json({ title: 'A' }) });
    const repo = new PaperRepository(fs, silentLogger);
    expect(await repo.count(T)).toBe(1);
    fs.setFile('T/b.json', json({ title: 'B' }));
    expect(await repo.count(T)).toBe(1);
    repo.reloadTopic('T');
    expect(await repo.count(T)).toBe(2);

    fs.setFile('T/c.json', json({ title: 'C' }));
    repo.reloadAll();
    expect(await repo.count(T)).toBe(3);

    fs.setFile('T/d.json', json({ title: 'D' }));
    await repo.reloadPaper(T, 'd');
    expect(await repo.count(T)).toBe(4);
  });

  it('주제 폴더가 없으면 DataError(notFound), 캐시하지 않는다', async () => {
    const fs = new MemoryFs();
    const repo = new PaperRepository(fs, silentLogger);
    await expect(repo.count(T)).rejects.toMatchObject({ kind: 'notFound' });
    fs.setFile('T/a.json', json({ title: 'A' }));
    expect(await repo.count(T)).toBe(1);
  });
});
