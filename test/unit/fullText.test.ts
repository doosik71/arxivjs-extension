import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataWriter } from '../../src/data/dataWriter';
import type { Paper, PaperMeta, Topic } from '../../src/data/models';
import { nodeReadonlyFs } from '../../src/data/readonlyFs';
import type { DataOpsContext } from '../../src/data/topicOps';
import type { FetchFn } from '../../src/sources/arxiv';
import { downloadPdf, FullTextError, getFullText, pdfUrlFor } from '../../src/sources/fullText';
import { copyFixture, putFile, type TempData } from './tempData';

const PDF = new TextEncoder().encode('%PDF-1.7 fake');
const pdfFetch = (body: Uint8Array | string = PDF, init: ResponseInit = { status: 200 }) => vi.fn<FetchFn>(async () => new Response(body, init));

describe('pdfUrlFor (형식 명세 §8.1.4)', () => {
  const meta = (m: Partial<PaperMeta>): PaperMeta => ({ title: 't', authors: 'a', ...m });
  it.each([
    [meta({ url: 'http://arxiv.org/abs/1904.04232v2' }), 'http://arxiv.org/pdf/1904.04232v2'],
    [meta({ url: 'http://arxiv.org/abs/1904.04232v2', source: 'arxiv' }), 'http://arxiv.org/pdf/1904.04232v2'],
    [meta({ url: 'https://example.com/paper.pdf', source: 'pdf' }), 'https://example.com/paper.pdf'],
    [meta({ url: 'https://example.com/abs/x', source: 'manual' }), undefined],
    [meta({ source: 'arxiv' }), undefined],
  ])('%o → %s', (m, url) => expect(pdfUrlFor(m)).toBe(url));
});

describe('downloadPdf', () => {
  it('PDF 바이트를 돌려준다', async () => {
    expect(await downloadPdf('https://x/p.pdf', { fetch: pdfFetch() })).toEqual(PDF);
  });

  it('HTTP 오류, PDF가 아닌 응답, 너무 큰 파일은 FullTextError', async () => {
    await expect(downloadPdf('https://x/p.pdf', { fetch: pdfFetch('', { status: 404 }) })).rejects.toThrow(/HTTP 404/);
    await expect(downloadPdf('https://x/p.pdf', { fetch: pdfFetch('<html>login</html>', { headers: { 'content-type': 'text/html' } }) })).rejects.toThrow(
      /not a PDF \(text\/html\)/,
    );
    await expect(downloadPdf('https://x/p.pdf', { fetch: pdfFetch(PDF, { headers: { 'content-length': String(200 * 1024 * 1024) } }) })).rejects.toThrow(
      FullTextError,
    );
  });
});

describe('getFullText (임시 복사본)', () => {
  let data: TempData;
  let ctx: DataOpsContext;
  const topic = (): Topic => ({ id: 'Broken_Data', label: 'Broken Data', path: path.join(data.root, 'Broken_Data') });
  const paper = (stem: string): Paper => ({ id: `Broken_Data/${stem}`, topicId: 'Broken_Data', stem, meta: { title: stem, authors: '' } });
  const arxivMeta: PaperMeta = { title: 't', authors: 'a', url: 'http://arxiv.org/abs/1904.04232v2' };

  beforeEach(() => {
    data = copyFixture();
    ctx = { root: data.root, fs: nodeReadonlyFs, writer: createDataWriter({ root: data.root, isEnabled: () => true }) };
  });
  afterEach(() => data.cleanup());

  it('.txt 캐시가 있으면 내려받지 않는다', async () => {
    const fetch = pdfFetch();
    const r = await getFullText(ctx, topic(), paper('valid_paper'), arxivMeta, { fetch, extract: async () => 'x' });
    expect(r.fromCache).toBe(true);
    expect(r.text).toBe(readFileSync(path.join(data.root, 'Broken_Data', 'valid_paper.txt'), 'utf8'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('캐시가 없거나 비어 있으면 PDF에서 뽑아 .txt로 저장한다', async () => {
    putFile(data, 'Broken_Data/valid_paper.txt', '  \n');
    const fetch = pdfFetch();
    const extract = vi.fn(async () => 'FULL TEXT');
    const r = await getFullText(ctx, topic(), paper('valid_paper'), arxivMeta, { fetch, extract });
    expect(r).toEqual({ text: 'FULL TEXT', fromCache: false });
    expect(String(fetch.mock.calls[0][0])).toBe('http://arxiv.org/pdf/1904.04232v2');
    expect(extract).toHaveBeenCalledWith(PDF);
    expect(readFileSync(path.join(data.root, 'Broken_Data', 'valid_paper.txt'), 'utf8')).toBe('FULL TEXT');
  });

  it('manual 논문에 .txt가 없으면 FullTextError', async () => {
    await expect(getFullText(ctx, topic(), paper('broken_json_paper'), { ...arxivMeta, source: 'manual' }, { fetch: pdfFetch(), extract: async () => 'x' })).rejects.toThrow(
      /manual/,
    );
  });

  it('텍스트가 비면(스캔 PDF) FullTextError이고 .txt를 만들지 않는다', async () => {
    await expect(getFullText(ctx, topic(), paper('broken_json_paper'), arxivMeta, { fetch: pdfFetch(), extract: async () => ' \n ' })).rejects.toThrow(/has no text/);
    expect(existsSync(path.join(data.root, 'Broken_Data', 'broken_json_paper.txt'))).toBe(false);
  });
});
