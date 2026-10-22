// 토픽 생성·이름 변경·삭제 (DEV-PLAN §6.6.1, 형식 명세 §6.3). vscode 비의존.
import * as path from 'node:path';
import { t } from '../i18n';
import { TOPIC_NAME_PATTERN, toDisplayName, toTopicFolderName } from '../util/displayName';
import type { DataWriter } from './dataWriter';
import { DataError } from './errors';
import type { ReadonlyFileSystem } from './readonlyFs';

export interface DataOpsContext {
  /** 데이터 폴더 절대 경로 */
  root: string;
  fs: ReadonlyFileSystem;
  writer: DataWriter;
}

/** 데이터 폴더 바로 아래의 모든 이름 (폴더, 파일, dot 항목 포함). 이름 중복 검사에 쓴다. */
export async function listRootNames(ctx: DataOpsContext): Promise<string[]> {
  return (await ctx.fs.readDir(ctx.root)).map((e) => e.name);
}

/**
 * 새 주제 이름을 검사한다. 문제가 없으면 undefined, 있으면 사용자에게 보일 이유를 돌려준다.
 * - 표시 이름 규칙(§2.2)
 * - 폴더 이름이나 표시 이름이 대소문자만 다른 항목도 중복으로 본다 (Windows, macOS 파일 시스템)
 * currentFolder: 이름을 바꿀 때 원래 폴더 이름. 자기 자신과는 비교하지 않는다(대소문자만 바꾸기 허용).
 */
export function checkTopicName(displayName: string, existingNames: readonly string[], currentFolder?: string): string | undefined {
  const label = toDisplayName(displayName);
  if (!label) {
    return t().data.topicNameRequired;
  }
  if (!TOPIC_NAME_PATTERN.test(label)) {
    return t().data.topicNameInvalid;
  }
  const folder = toTopicFolderName(label);
  if (folder === currentFolder) {
    return t().data.topicNameUnchanged;
  }
  const key = label.toLowerCase();
  const clash = existingNames.find(
    (name) => name !== currentFolder && (name.toLowerCase() === folder.toLowerCase() || toDisplayName(name).toLowerCase() === key),
  );
  return clash === undefined ? undefined : t().data.topicNameExists(clash);
}

async function validated(ctx: DataOpsContext, displayName: string, currentFolder?: string): Promise<string> {
  const reason = checkTopicName(displayName, await listRootNames(ctx), currentFolder);
  const folder = toTopicFolderName(displayName);
  if (reason) {
    throw new DataError('conflict', path.join(ctx.root, folder), reason);
  }
  return folder;
}

/** 주제 폴더를 만들고 폴더 이름을 돌려준다. */
export async function createTopic(ctx: DataOpsContext, displayName: string): Promise<string> {
  const folder = await validated(ctx, displayName);
  await ctx.writer.makeDirectory(path.join(ctx.root, folder));
  return folder;
}

/** 주제 폴더 이름을 바꾸고 새 폴더 이름을 돌려준다. 폴더 안의 파일 이름은 그대로다. */
export async function renameTopic(ctx: DataOpsContext, topicId: string, newDisplayName: string): Promise<string> {
  const folder = await validated(ctx, newDisplayName, topicId);
  await ctx.writer.move(path.join(ctx.root, topicId), path.join(ctx.root, folder));
  return folder;
}

/** 폴더 안 항목을 "확장자별 개수"로 요약한다. 예: ".json 2개, .txt 1개" */
export function summarizeEntries(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) {
    const ext = name.startsWith('.') ? name : path.extname(name).toLowerCase() || t().data.noExtension;
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts].map(([ext, n]) => t().data.entryCount(ext, n)).join(', ');
}

/** 주제 폴더가 완전히 비어 있을 때만 지운다. 비어 있지 않으면 conflict (메시지에 남은 항목 요약). */
export async function deleteTopic(ctx: DataOpsContext, topicId: string): Promise<void> {
  const dir = path.join(ctx.root, topicId);
  const names = (await ctx.fs.readDir(dir)).map((e) => e.name);
  if (names.length > 0) {
    throw new DataError('conflict', dir, t().data.topicNotEmpty(summarizeEntries(names)));
  }
  await ctx.writer.removeEmptyDirectory(dir);
}
