import type { Logger } from '../util/logger';
import type { PaperSort } from './models';
import { PaperRepository } from './paperRepository';
import type { ReadonlyFileSystem } from './readonlyFs';
import { TopicRepository } from './topicRepository';

/** 데이터 폴더 하나에 대한 저장소 묶음. 데이터 폴더 설정이 바뀌면 새로 만든다. */
export class Library {
  readonly topics: TopicRepository;
  readonly papers: PaperRepository;

  constructor(
    readonly root: string,
    fs: ReadonlyFileSystem,
    log: Logger,
    sort: () => PaperSort,
  ) {
    this.topics = new TopicRepository(root, fs, log);
    this.papers = new PaperRepository(fs, log, { sort });
  }

  /** 모든 캐시를 비운다. */
  reloadAll(): void {
    this.topics.reload();
    this.papers.reloadAll();
  }
}
