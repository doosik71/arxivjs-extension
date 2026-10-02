// 테스트용 메모리 파일 시스템.
// 디스크에 쓰지 않고 "다른 앱이 파일을 바꾼" 상황(추가, 삭제, 쓰는 도중의 파일)을 재현한다.
import * as path from 'node:path';
import { DataError } from '../../src/data/errors';
import type { DirEntry, FileStat, ReadonlyFileSystem } from '../../src/data/readonlyFs';

export const ROOT = path.resolve('/memdata');

/** 파일 내용. 함수이면 읽을 때마다 호출해서 내용을 정한다(읽기 횟수 0부터). */
type Content = string | ((readCount: number) => string);

export class MemoryFs implements ReadonlyFileSystem {
  private readonly files = new Map<string, Content>();
  private readonly dirs = new Set<string>([ROOT]);
  readonly readCounts = new Map<string, number>();
  private active = 0;
  maxConcurrentReads = 0;
  /** readText 응답 지연 ms (동시성 측정용) */
  readDelayMs = 0;

  constructor(files: Record<string, Content> = {}) {
    for (const [rel, content] of Object.entries(files)) {
      this.setFile(rel, content);
    }
  }

  static abs(rel: string): string {
    return path.join(ROOT, rel);
  }

  setFile(rel: string, content: Content): void {
    const p = MemoryFs.abs(rel);
    this.files.set(p, content);
    for (let d = path.dirname(p); d.startsWith(ROOT); d = path.dirname(d)) {
      this.dirs.add(d);
      if (d === ROOT) {
        break;
      }
    }
  }

  addDir(rel: string): void {
    this.dirs.add(MemoryFs.abs(rel));
  }

  removeFile(rel: string): void {
    this.files.delete(MemoryFs.abs(rel));
  }

  reads(rel: string): number {
    return this.readCounts.get(MemoryFs.abs(rel)) ?? 0;
  }

  async readText(p: string): Promise<string> {
    const content = this.files.get(p);
    if (content === undefined) {
      throw new DataError(this.dirs.has(p) ? 'io' : 'notFound', p, 'not found');
    }
    const count = this.readCounts.get(p) ?? 0;
    this.readCounts.set(p, count + 1);
    this.active++;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.active);
    try {
      await new Promise((r) => setTimeout(r, this.readDelayMs));
      return typeof content === 'function' ? content(count) : content;
    } finally {
      this.active--;
    }
  }

  async readDir(p: string): Promise<DirEntry[]> {
    if (!this.dirs.has(p)) {
      throw new DataError(this.files.has(p) ? 'notDirectory' : 'notFound', p, 'not a directory');
    }
    const names = new Map<string, DirEntry>();
    for (const f of this.files.keys()) {
      if (path.dirname(f) === p) {
        names.set(path.basename(f), { name: path.basename(f), isDirectory: false, isFile: true });
      }
    }
    for (const d of this.dirs) {
      if (d !== p && path.dirname(d) === p) {
        names.set(path.basename(d), { name: path.basename(d), isDirectory: true, isFile: false });
      }
    }
    return [...names.values()];
  }

  async stat(p: string): Promise<FileStat> {
    if (this.dirs.has(p)) {
      return { isDirectory: true, isFile: false, size: 0, mtimeMs: 0 };
    }
    const content = this.files.get(p);
    if (content === undefined) {
      throw new DataError('notFound', p, 'not found');
    }
    return { isDirectory: false, isFile: true, size: typeof content === 'string' ? content.length : 0, mtimeMs: 0 };
  }
}

export const json = (o: Record<string, unknown>) => JSON.stringify(o);
