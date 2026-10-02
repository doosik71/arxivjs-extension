import * as path from 'node:path';
import * as vscode from 'vscode';
import type { PaperSort } from './data/models';

export const CONFIG_SECTION = 'arxivjs';

export interface ArxivjsConfig {
  /** 정규화한 절대 경로. 설정이 비었거나 절대 경로가 아니면 undefined */
  dataFolder: string | undefined;
  /** 설정에 적힌 원래 값 (오류 메시지용) */
  dataFolderRaw: string;
  paperSort: PaperSort;
  openInNewTab: boolean;
}

const SORTS: readonly PaperSort[] = ['citation', 'year', 'title'];

export function readConfig(): ArxivjsConfig {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const raw = (c.get<string>('dataFolder') ?? '').trim();
  const sort = c.get<string>('paperSort') as PaperSort;
  return {
    dataFolder: raw && path.isAbsolute(raw) ? path.normalize(raw) : undefined,
    dataFolderRaw: raw,
    paperSort: SORTS.includes(sort) ? sort : 'citation',
    openInNewTab: c.get<boolean>('openInNewTab') ?? false,
  };
}

/** 데이터 폴더 경로를 사용자 설정에 저장한다. (데이터 폴더 자체에는 쓰지 않는다) */
export async function saveDataFolder(folder: string): Promise<void> {
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update('dataFolder', folder, vscode.ConfigurationTarget.Global);
}
