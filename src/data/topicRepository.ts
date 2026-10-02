import * as path from 'node:path';
import { isValidTopicName, toDisplayName } from '../util/displayName';
import type { Logger } from '../util/logger';
import { DataError } from './errors';
import type { Topic } from './models';
import type { ReadonlyFileSystem } from './readonlyFs';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** 데이터 폴더의 주제 목록 (DEV-PLAN §6.1). 결과는 reload() 전까지 캐시한다. */
export class TopicRepository {
  private cache: Promise<Topic[]> | undefined;

  constructor(
    readonly root: string,
    private readonly fs: ReadonlyFileSystem,
    private readonly log: Logger,
  ) {}

  list(): Promise<Topic[]> {
    if (!this.cache) {
      const pending = this.scan();
      this.cache = pending;
      // 실패한 결과는 캐시하지 않는다. 다음 호출에서 다시 시도한다.
      pending.catch(() => {
        if (this.cache === pending) {
          this.cache = undefined;
        }
      });
    }
    return this.cache;
  }

  async get(id: string): Promise<Topic | undefined> {
    return (await this.list()).find((t) => t.id === id);
  }

  /** 캐시를 비운다. 다음 list()에서 다시 읽는다. */
  reload(): void {
    this.cache = undefined;
  }

  private async scan(): Promise<Topic[]> {
    const rootStat = await this.fs.stat(this.root);
    if (!rootStat.isDirectory) {
      throw new DataError('notDirectory', this.root, '데이터 폴더가 디렉터리가 아니다');
    }

    const topics: Topic[] = [];
    for (const entry of await this.fs.readDir(this.root)) {
      if (!entry.isDirectory || entry.name.startsWith('.')) {
        continue;
      }
      if (!isValidTopicName(entry.name)) {
        this.log.warn(`주제 폴더 이름 규칙(영숫자, _, -)에 맞지 않아 제외: "${entry.name}"`);
        continue;
      }
      topics.push({ id: entry.name, label: toDisplayName(entry.name), path: path.join(this.root, entry.name) });
    }
    return topics.sort((a, b) => collator.compare(a.label, b.label));
  }
}
