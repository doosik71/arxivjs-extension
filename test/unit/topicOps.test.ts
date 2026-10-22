import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataWriter } from '../../src/data/dataWriter';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import {
  checkTopicName,
  createTopic,
  deleteTopic,
  renameTopic,
  summarizeEntries,
  type DataOpsContext,
} from '../../src/data/topicOps';
import { toTopicFolderName } from '../../src/util/displayName';
import { copyFixture, type TempData } from './tempData';

describe('toTopicFolderName', () => {
  it.each([
    ['Agentic AI', 'Agentic_AI'],
    ['  Zero-Shot   Learning ', 'Zero-Shot_Learning'],
    ['딥러닝 (Deep Learning)', '딥러닝_(Deep_Learning)'],
    ['Already_Folder', 'Already_Folder'],
  ])('%s → %s', (name, folder) => expect(toTopicFolderName(name)).toBe(folder));
});

describe('checkTopicName', () => {
  const names = ['Few-Shot_Learning', 'Topic With Spaces', '.git', 'notes.txt'];

  it('문제가 없으면 undefined', () => {
    expect(checkTopicName('딥러닝 (Deep Learning)', names)).toBeUndefined();
  });

  it.each([
    ['', 'Enter a topic name'],
    ['   ', 'Enter a topic name'],
    ['a.b', 'Only letters, digits'],
    ['a/b', 'Only letters, digits'],
    ['few-shot learning', 'already exists'], // 대소문자만 다른 폴더
    ['Topic_With_Spaces', 'already exists'], // 표시 이름이 같은 폴더 (공백 폴더)
  ])('"%s" → "%s" 포함', (name, reason) => {
    expect(checkTopicName(name, names)).toContain(reason);
  });

  it('이름 변경: 자기 자신과는 비교하지 않아 대소문자만 바꿀 수 있다', () => {
    expect(checkTopicName('few-shot learning', names, 'Few-Shot_Learning')).toBeUndefined();
    expect(checkTopicName('Few-Shot Learning', names, 'Few-Shot_Learning')).toContain('Same as the current name');
  });
});

describe('summarizeEntries', () => {
  it('확장자별 개수', () => {
    expect(summarizeEntries(['a.json', 'b.json', 'a.TXT', 'README', '.DS_Store'])).toBe(
      '.json: 2, .txt: 1, (no extension): 1, .DS_Store: 1',
    );
  });
});

describe('topicOps (임시 복사본)', () => {
  let data: TempData;
  let ctx: DataOpsContext;
  const at = (...parts: string[]) => path.join(data.root, ...parts);

  beforeEach(() => {
    data = copyFixture();
    ctx = { root: data.root, fs: nodeReadonlyFs, writer: createDataWriter({ root: data.root, isEnabled: () => true }) };
  });

  afterEach(() => data.cleanup());

  it('createTopic: 표시 이름을 폴더 이름으로 바꿔 만든다', async () => {
    expect(await createTopic(ctx, '  강화 학습 (RL) ')).toBe('강화_학습_(RL)');
    expect(existsSync(at('강화_학습_(RL)'))).toBe(true);
  });

  it('createTopic: 중복이나 규칙 위반이면 conflict, 아무것도 만들지 않는다', async () => {
    const before = readdirSync(data.root).sort();
    await expect(createTopic(ctx, 'autoencoder')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(createTopic(ctx, 'Bad.Name')).rejects.toMatchObject({ kind: 'conflict' });
    expect(readdirSync(data.root).sort()).toEqual(before);
  });

  it('renameTopic: 폴더 이름만 바뀌고 안의 파일 이름은 그대로다', async () => {
    const files = readdirSync(at('Cosine_Similarity')).sort();
    expect(await renameTopic(ctx, 'Cosine_Similarity', '코사인 유사도')).toBe('코사인_유사도');
    expect(existsSync(at('Cosine_Similarity'))).toBe(false);
    expect(readdirSync(at('코사인_유사도')).sort()).toEqual(files);
  });

  it('renameTopic: 대소문자만 바꿀 수 있다', async () => {
    expect(await renameTopic(ctx, 'Autoencoder', 'AutoEncoder')).toBe('AutoEncoder');
    expect(readdirSync(data.root)).toContain('AutoEncoder');
    expect(readdirSync(data.root)).not.toContain('Autoencoder');
  });

  it('renameTopic: 다른 주제와 이름이 겹치면 conflict', async () => {
    await expect(renameTopic(ctx, 'Autoencoder', 'Broken Data')).rejects.toMatchObject({ kind: 'conflict' });
    expect(existsSync(at('Autoencoder'))).toBe(true);
  });

  it('deleteTopic: 비어 있지 않으면 conflict (남은 파일 요약), 비어 있으면 지운다', async () => {
    await expect(deleteTopic(ctx, 'Broken_Data')).rejects.toThrow(/\.json: 2/);
    expect(existsSync(at('Broken_Data'))).toBe(true);

    const folder = await createTopic(ctx, 'Empty Topic');
    await deleteTopic(ctx, folder);
    expect(existsSync(at(folder))).toBe(false);
  });

  it('쓰기가 꺼져 있으면 writeDisabled', async () => {
    const off: DataOpsContext = { ...ctx, writer: createDataWriter({ root: data.root, isEnabled: () => false }) };
    await expect(createTopic(off, 'New Topic')).rejects.toMatchObject({ kind: 'writeDisabled' });
    expect(existsSync(at('New_Topic'))).toBe(false);
  });
});
