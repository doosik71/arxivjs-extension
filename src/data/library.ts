import type { Logger } from '../util/logger';
import { createDataWriter, type DataWriter } from './dataWriter';
import type { PaperSort } from './models';
import { PaperRepository } from './paperRepository';
import type { ReadonlyFileSystem } from './readonlyFs';
import type { TopicOpsContext } from './topicOps';
import { TopicRepository } from './topicRepository';

/** 데이터 폴더 하나에 대한 저장소 묶음. 데이터 폴더 설정이 바뀌면 새로 만든다. */
export class Library {
  readonly topics: TopicRepository;
  readonly papers: PaperRepository;
  /** 쓰기 지점. isWriteEnabled()가 false이면 모든 쓰기를 거부한다. */
  readonly writer: DataWriter;

  constructor(
    readonly root: string,
    private readonly fs: ReadonlyFileSystem,
    log: Logger,
    sort: () => PaperSort,
    isWriteEnabled: () => boolean,
  ) {
    this.topics = new TopicRepository(root, fs, log);
    this.papers = new PaperRepository(fs, log, { sort });
    this.writer = createDataWriter({ root, isEnabled: isWriteEnabled });
  }

  /** topicOps에 넘길 컨텍스트 */
  get ops(): TopicOpsContext {
    return { root: this.root, fs: this.fs, writer: this.writer };
  }

  /** 모든 캐시를 비운다. */
  reloadAll(): void {
    this.topics.reload();
    this.papers.reloadAll();
  }
}
