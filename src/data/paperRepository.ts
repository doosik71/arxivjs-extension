import * as path from 'node:path';
import type { Logger } from '../util/logger';
import { mapLimit } from '../util/mapLimit';
import { DataError, isNotFound } from './errors';
import type { Paper, PaperMeta, PaperSort, Topic } from './models';
import { fallbackMeta, parseMarkdownHeader, parseMetaJson } from './paperMeta';
import { sortPapers } from './paperSort';
import type { ReadonlyFileSystem } from './readonlyFs';

export interface PaperRepositoryOptions {
  /** json 동시 읽기 수 (기본 16) */
  concurrency?: number;
  /** json 파싱 실패 시 재시도 전 대기 시간 ms (기본 200) */
  retryDelayMs?: number;
  /** 목록 정렬 기준을 돌려준다 (기본 'citation') */
  sort?: () => PaperSort;
}

interface FilePair {
  stem: string;
  jsonPath?: string;
  mdPath?: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** 주제별 논문 목록과 문서 읽기 (DEV-PLAN §6.2–6.3). 목록은 주제별로 reload 전까지 캐시한다. */
export class PaperRepository {
  private readonly cache = new Map<string, Promise<Paper[]>>();
  /** 목록을 읽지 않은 주제의 논문 수 */
  private readonly counts = new Map<string, Promise<number>>();
  private readonly concurrency: number;
  private readonly retryDelayMs: number;
  private readonly sort: () => PaperSort;

  constructor(
    private readonly fs: ReadonlyFileSystem,
    private readonly log: Logger,
    options: PaperRepositoryOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 16;
    this.retryDelayMs = options.retryDelayMs ?? 200;
    this.sort = options.sort ?? (() => 'citation');
  }

  /** 주제의 논문 목록. 정렬은 호출할 때의 sort 설정을 따른다. */
  async list(topic: Topic): Promise<Paper[]> {
    let pending = this.cache.get(topic.id);
    if (!pending) {
      pending = this.scan(topic);
      this.cache.set(topic.id, pending);
      const settled = pending;
      settled.catch(() => {
        if (this.cache.get(topic.id) === settled) {
          this.cache.delete(topic.id);
        }
      });
    }
    return sortPapers(await pending, this.sort());
  }

  /** 이미 읽은 주제인지 (트리의 논문 수 표시용) */
  isLoaded(topicId: string): boolean {
    return this.cache.has(topicId);
  }

  /**
   * 주제의 논문 수 (홈 페이지용). 목록을 읽은 주제는 그 길이를, 아니면 폴더 목록만 읽어 stem 수를 센다.
   * json은 읽지 않으므로 108개 주제 전체를 세도 빠르다. 결과는 reload 전까지 캐시한다.
   */
  async count(topic: Topic): Promise<number> {
    const cached = this.cache.get(topic.id);
    if (cached) {
      return (await cached).length;
    }
    let pending = this.counts.get(topic.id);
    if (!pending) {
      pending = this.filePairs(topic).then((pairs) => pairs.size);
      this.counts.set(topic.id, pending);
      const settled = pending;
      settled.catch(() => {
        if (this.counts.get(topic.id) === settled) {
          this.counts.delete(topic.id);
        }
      });
    }
    return pending;
  }

  /** 한 주제의 캐시를 비운다. */
  reloadTopic(topicId: string): void {
    this.cache.delete(topicId);
    this.counts.delete(topicId);
  }

  /** 모든 캐시를 비운다. */
  reloadAll(): void {
    this.cache.clear();
    this.counts.clear();
  }

  /**
   * 논문 하나의 json과 md 존재 여부를 다시 읽는다.
   * 두 파일이 모두 사라졌으면 undefined를 돌려준다. 캐시된 목록의 항목도 함께 바꾼다.
   */
  async reloadPaper(topic: Topic, stem: string): Promise<Paper | undefined> {
    const pair: FilePair = { stem };
    for (const [ext, key] of [['.json', 'jsonPath'], ['.md', 'mdPath']] as const) {
      const p = path.join(topic.path, stem + ext);
      if (await this.isFile(p)) {
        pair[key] = p;
      }
    }
    const paper = pair.jsonPath || pair.mdPath ? await this.readPaper(topic, pair) : undefined;
    this.counts.delete(topic.id);

    const cached = this.cache.get(topic.id);
    if (cached) {
      const id = `${topic.id}/${stem}`;
      const updated = cached.then((list) => {
        const rest = list.filter((p) => p.id !== id);
        return paper ? [...rest, paper] : rest;
      });
      this.cache.set(topic.id, updated);
    }
    return paper;
  }

  /**
   * 논문의 md 문서. md 파일이 없는 논문이면 undefined.
   * 목록을 읽은 뒤 파일이 사라졌으면 DataError('notFound')를 던진다.
   */
  async readMarkdown(paper: Paper): Promise<string | undefined> {
    return paper.mdPath ? this.fs.readText(paper.mdPath) : undefined;
  }

  /** 폴더의 .json/.md를 stem별로 묶는다. */
  private async filePairs(topic: Topic): Promise<Map<string, FilePair>> {
    const pairs = new Map<string, FilePair>();
    for (const entry of await this.fs.readDir(topic.path)) {
      if (!entry.isFile) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.json' && ext !== '.md') {
        continue; // .txt, .hlt, .bak, .md.bak 등은 무시
      }
      const stem = entry.name.slice(0, -ext.length);
      const pair = pairs.get(stem) ?? { stem };
      pair[ext === '.json' ? 'jsonPath' : 'mdPath'] = path.join(topic.path, entry.name);
      pairs.set(stem, pair);
    }
    return pairs;
  }

  private async scan(topic: Topic): Promise<Paper[]> {
    const pairs = await this.filePairs(topic);
    const papers = await mapLimit([...pairs.values()], this.concurrency, (pair) =>
      this.readPaper(topic, pair).catch((err) => {
        // readdir 이후 파일이 사라진 경우: 목록에서 빼고 넘어간다.
        if (isNotFound(err)) {
          this.log.warn(`읽는 도중 파일이 사라짐: ${topic.id}/${pair.stem}`);
          return undefined;
        }
        throw err;
      }),
    );
    return papers.filter((p): p is Paper => p !== undefined);
  }

  private async readPaper(topic: Topic, pair: FilePair): Promise<Paper> {
    const base = { id: `${topic.id}/${pair.stem}`, topicId: topic.id, stem: pair.stem, jsonPath: pair.jsonPath, mdPath: pair.mdPath };

    if (pair.jsonPath) {
      const result = await this.readMeta(pair.jsonPath);
      if ('meta' in result) {
        if (!result.meta.title) {
          result.meta.title = (await this.headerFallback(pair)).title;
        }
        return { ...base, meta: result.meta };
      }
      this.log.warn(`메타 정보를 읽지 못함: ${base.id}.json — ${result.error}`);
      return { ...base, meta: await this.headerFallback(pair), metaError: result.error };
    }
    return { ...base, meta: await this.headerFallback(pair) };
  }

  /** json 파싱. 쓰는 도중의 파일일 수 있으므로 문법 오류는 한 번 더 읽어 본다. */
  private async readMeta(jsonPath: string): Promise<{ meta: PaperMeta } | { error: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await delay(this.retryDelayMs);
      }
      const text = await this.fs.readText(jsonPath); // notFound 등 I/O 오류는 호출자에게 넘긴다.
      try {
        return { meta: parseMetaJson(text) };
      } catch (err) {
        lastError = err;
      }
    }
    return { error: errorMessage(lastError) };
  }

  /** md 헤더 또는 파일 이름에서 메타 정보를 추정한다. */
  private async headerFallback(pair: FilePair): Promise<PaperMeta> {
    let header = {};
    if (pair.mdPath) {
      try {
        header = parseMarkdownHeader(await this.fs.readText(pair.mdPath));
      } catch (err) {
        if (!(err instanceof DataError)) {
          throw err;
        }
        this.log.warn(`md 헤더를 읽지 못함: ${pair.mdPath} — ${err.message}`);
      }
    }
    return fallbackMeta(pair.stem, header);
  }

  private async isFile(p: string): Promise<boolean> {
    try {
      return (await this.fs.stat(p)).isFile;
    } catch (err) {
      if (isNotFound(err)) {
        return false;
      }
      throw err;
    }
  }
}
