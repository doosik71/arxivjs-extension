import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataWriter } from '../../src/data/dataWriter';
import type { Paper, Topic } from '../../src/data/models';
import { deletePaper, deleteSummary, movePaper, paperExists, readPaperMeta, savePaper, updateMeta, type NewPaper } from '../../src/data/paperOps';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import type { DataOpsContext } from '../../src/data/topicOps';
import { toDisplayName } from '../../src/util/displayName';
import { copyFixture, putFile, type TempData } from './tempData';

let data: TempData;
let ctx: DataOpsContext;

const at = (...parts: string[]) => path.join(data.root, ...parts);
const topic = (id: string): Topic => ({ id, label: toDisplayName(id), path: at(id) });
const files = (topicId: string, stem: string) =>
  readdirSync(at(topicId))
    .filter((n) => n.startsWith(`${stem}.`))
    .sort();
const readJson = (...parts: string[]) => JSON.parse(readFileSync(at(...parts), 'utf8'));

/** 디스크의 파일로 Paper를 만든다 (PaperRepository와 같은 모양) */
function paper(topicId: string, stem: string): Paper {
  const jsonPath = at(topicId, `${stem}.json`);
  const mdPath = at(topicId, `${stem}.md`);
  return {
    id: `${topicId}/${stem}`,
    topicId,
    stem,
    meta: { title: stem, authors: '' },
    jsonPath: existsSync(jsonPath) ? jsonPath : undefined,
    mdPath: existsSync(mdPath) ? mdPath : undefined,
  };
}

const NEW_PAPER: NewPaper = {
  title: '  Attention   Is All\nYou Need ',
  authors: 'Ashish Vaswani,  Noam Shazeer',
  year: 2017,
  url: 'http://arxiv.org/abs/1706.03762v7',
  abstract: 'The dominant sequence transduction models ...',
  source: 'arxiv',
};

beforeEach(() => {
  data = copyFixture();
  ctx = { root: data.root, fs: nodeReadonlyFs, writer: createDataWriter({ root: data.root, isEnabled: () => true }) };
});

afterEach(() => data.cleanup());

describe('savePaper (형식 명세 §9.1)', () => {
  it('제목 slug로 저장하고, 2칸 들여쓰기·끝 줄바꿈 없음·필드 순서를 지킨다', async () => {
    const id = await savePaper(ctx, topic('Autoencoder'), NEW_PAPER);
    expect(id).toBe('attention_is_all_you_need');
    const text = readFileSync(at('Autoencoder', `${id}.json`), 'utf8');
    expect(text.endsWith('}')).toBe(true);
    expect(text).toBe(
      JSON.stringify(
        {
          title: 'Attention Is All You Need',
          authors: 'Ashish Vaswani, Noam Shazeer',
          year: 2017,
          url: 'http://arxiv.org/abs/1706.03762v7',
          abstract: 'The dominant sequence transduction models ...',
          source: 'arxiv',
        },
        null,
        2,
      ),
    );
    expect(await paperExists(ctx, topic('Autoencoder'), id)).toBe(true);
  });

  it('같은 paperId가 있으면 overwrite일 때만 덮어쓴다', async () => {
    const t = topic('Cosine_Similarity');
    const p = { ...NEW_PAPER, title: 'A Closer Look at Few-shot Classification', citation: undefined };
    await expect(savePaper(ctx, t, p)).rejects.toMatchObject({ kind: 'conflict' });
    expect(readJson('Cosine_Similarity', 'a_closer_look_at_few_shot_classification.json').citation).toBeDefined();

    await savePaper(ctx, t, p, { overwrite: true });
    expect(readJson('Cosine_Similarity', 'a_closer_look_at_few_shot_classification.json').citation).toBeUndefined();
  });

  it('제목 slug가 비면 입력한 paperId를 쓰고, 없거나 틀리면 conflict', async () => {
    const korean = { ...NEW_PAPER, title: '딥러닝 입문' };
    await expect(savePaper(ctx, topic('Autoencoder'), korean)).rejects.toMatchObject({ kind: 'conflict' });
    await expect(savePaper(ctx, topic('Autoencoder'), korean, { paperId: 'Bad Id' })).rejects.toMatchObject({ kind: 'conflict' });
    expect(await savePaper(ctx, topic('Autoencoder'), korean, { paperId: 'deep_learning_intro' })).toBe('deep_learning_intro');
    expect(readJson('Autoencoder', 'deep_learning_intro.json').title).toBe('딥러닝 입문');
  });
});

describe('updateMeta (read-modify-write)', () => {
  it('바꾼 필드만 고치고, 모르는 필드는 남기고, 저장 금지 필드는 뺀다', async () => {
    const p = paper('Broken_Data', 'valid_paper');
    putFile(
      data,
      'Broken_Data/valid_paper.json',
      JSON.stringify({ title: 'Old', authors: 'A', year: 2024, citation: 1, x_other_tool: { keep: true }, id: 'bad', hasSummary: true }, null, 2),
    );
    await updateMeta(ctx, p, { title: '  New   Title ', citation: null, source: 'manual' });
    expect(readJson('Broken_Data', 'valid_paper.json')).toEqual({
      title: 'New Title',
      authors: 'A',
      year: 2024,
      x_other_tool: { keep: true },
      source: 'manual',
    });
    // 파일 이름(paperId)은 그대로다.
    expect(files('Broken_Data', 'valid_paper')).toContain('valid_paper.json');
  });

  it('깨진 JSON이면 conflict이고 파일을 바꾸지 않는다', async () => {
    const before = readFileSync(at('Broken_Data', 'broken_json_paper.json'), 'utf8');
    await expect(updateMeta(ctx, paper('Broken_Data', 'broken_json_paper'), { title: 'X' })).rejects.toMatchObject({ kind: 'conflict' });
    expect(readFileSync(at('Broken_Data', 'broken_json_paper.json'), 'utf8')).toBe(before);
  });

  it('readPaperMeta: 디스크의 최신 값을 읽는다', async () => {
    expect((await readPaperMeta(ctx, paper('Autoencoder', 'autoencoder_based_feature_learning_for_cyber_security_applications'))).source).toBe('manual');
  });
});

describe('movePaper (형식 명세 §9.3)', () => {
  it('대상에 없으면 .json, .md, .txt를 옮기고 원본의 백업 파일을 지운다', async () => {
    const result = await movePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'), topic('Autoencoder'));
    expect(result).toBe('moved');
    expect(files('Broken_Data', 'valid_paper')).toEqual([]);
    expect(files('Autoencoder', 'valid_paper')).toEqual(['valid_paper.json', 'valid_paper.md', 'valid_paper.txt']);
  });

  it('.hlt도 함께 옮긴다', async () => {
    const stem = 'low_shot_learning_with_imprinted_weights';
    await movePaper(ctx, paper('Cosine_Similarity', stem), topic('Cosine_Similarity'), topic('Autoencoder'));
    expect(files('Autoencoder', stem)).toEqual([`${stem}.hlt`, `${stem}.json`, `${stem}.md`]);
  });

  it('대상이 같거나 최신이면(날짜 없음) 원본을 지우고, .txt는 대상에 없을 때만 옮긴다', async () => {
    putFile(data, 'Autoencoder/valid_paper.json', JSON.stringify({ title: 'Target', authors: 'T', year: 2020 }));
    putFile(data, 'Autoencoder/valid_paper.md', '# Target');
    const result = await movePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'), topic('Autoencoder'));
    expect(result).toBe('keptTarget');
    expect(files('Broken_Data', 'valid_paper')).toEqual([]);
    expect(readJson('Autoencoder', 'valid_paper.json').title).toBe('Target');
    expect(readFileSync(at('Autoencoder', 'valid_paper.md'), 'utf8')).toBe('# Target');
    expect(existsSync(at('Autoencoder', 'valid_paper.txt'))).toBe(true); // 대상에 없던 .txt는 옮겨진다.
  });

  it('대상에 .txt가 있고 대상을 남기면 원본 .txt를 지운다', async () => {
    putFile(data, 'Autoencoder/valid_paper.json', JSON.stringify({ title: 'Target', authors: 'T', year: 2020 }));
    putFile(data, 'Autoencoder/valid_paper.txt', 'target text');
    await movePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'), topic('Autoencoder'));
    expect(readFileSync(at('Autoencoder', 'valid_paper.txt'), 'utf8')).toBe('target text');
    expect(existsSync(at('Broken_Data', 'valid_paper.txt'))).toBe(false);
  });

  it('옮기는 논문이 최신이면 .json을 바꾸고, .md는 더 최신인 쪽을, .hlt는 남은 .md와 짝을 남긴다', async () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const recent = new Date('2025-01-01T00:00:00Z');
    putFile(data, 'Broken_Data/valid_paper.json', JSON.stringify({ title: 'Moving', authors: 'M', year: 2024, dateAdded: '2025-01-01T00:00:00Z' }));
    putFile(data, 'Broken_Data/valid_paper.md', '# Moving (old)', old);
    putFile(data, 'Broken_Data/valid_paper.hlt', '{"version":1,"highlights":[]}');
    putFile(data, 'Autoencoder/valid_paper.json', JSON.stringify({ title: 'Target', authors: 'T', year: 2020, dateAdded: '2021-01-01T00:00:00Z' }));
    putFile(data, 'Autoencoder/valid_paper.md', '# Target (recent)', recent);
    putFile(data, 'Autoencoder/valid_paper.hlt', '{"version":1,"highlights":[{"text":"Target","color":"sun"}]}');
    putFile(data, 'Autoencoder/valid_paper.txt', 'target text');

    const result = await movePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'), topic('Autoencoder'));
    expect(result).toBe('replaced');
    expect(files('Broken_Data', 'valid_paper')).toEqual([]);
    expect(readJson('Autoencoder', 'valid_paper.json').title).toBe('Moving');
    expect(readFileSync(at('Autoencoder', 'valid_paper.md'), 'utf8')).toBe('# Target (recent)'); // 대상 .md가 최신
    expect(readFileSync(at('Autoencoder', 'valid_paper.hlt'), 'utf8')).toContain('Target'); // 남은 .md의 짝
    expect(readFileSync(at('Autoencoder', 'valid_paper.txt'), 'utf8')).not.toBe('target text'); // 원본 .txt로 바뀜
  });

  it('같은 주제로는 옮길 수 없다', async () => {
    await expect(movePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'), topic('Broken_Data'))).rejects.toMatchObject({
      kind: 'conflict',
    });
  });
});

describe('deletePaper / deleteSummary', () => {
  it('deletePaper: .json, .md, .hlt, .txt를 지우고 백업 파일은 남긴다 (형식 명세 §9.4)', async () => {
    await deletePaper(ctx, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'));
    expect(files('Broken_Data', 'valid_paper')).toEqual(['valid_paper.bak', 'valid_paper.md.bak']);
  });

  it('deleteSummary: .md와 .hlt만 지우고 백업을 만들지 않는다 (DEV-PLAN §2.8)', async () => {
    const stem = 'low_shot_learning_with_imprinted_weights';
    await deleteSummary(ctx, paper('Cosine_Similarity', stem), topic('Cosine_Similarity'));
    expect(files('Cosine_Similarity', stem)).toEqual([`${stem}.json`]);
  });

  it('쓰기가 꺼져 있으면 writeDisabled이고 아무것도 지우지 않는다', async () => {
    const off: DataOpsContext = { ...ctx, writer: createDataWriter({ root: data.root, isEnabled: () => false }) };
    const before = files('Broken_Data', 'valid_paper');
    await expect(deletePaper(off, paper('Broken_Data', 'valid_paper'), topic('Broken_Data'))).rejects.toMatchObject({ kind: 'writeDisabled' });
    expect(files('Broken_Data', 'valid_paper')).toEqual(before);
  });
});
