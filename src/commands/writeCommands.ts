// 쓰기 명령 (DEV-PLAN §3.2.2): 입력 UI, 확인 대화상자, 쓰기 후 다시 읽기.
// 실제 파일 작업은 src/data/topicOps.ts → DataWriter가 한다.
import * as vscode from 'vscode';
import { DataError } from '../data/errors';
import type { Library } from '../data/library';
import type { Topic } from '../data/models';
import { checkTopicName, createTopic, deleteTopic, listRootNames, renameTopic, summarizeEntries } from '../data/topicOps';
import { toTopicFolderName } from '../util/displayName';
import type { Logger } from '../util/logger';
import type { TreeNode } from '../views/topicTreeProvider';

export interface WriteCommandHost {
  getLibrary(): Library | undefined;
  isWriteEnabled(): boolean;
  pickTopic(title: string): Promise<Topic | undefined>;
  /** 주제 목록이 바뀌었다: 캐시를 비우고 트리, 홈, Topic 패널을 다시 그린다. */
  reloadAll(): void;
  /** 이름을 바꾼 주제를 보던 패널을 새 주제로 옮긴다. reloadAll() 다음에 부른다. */
  onTopicRenamed(oldId: string, newId: string): Promise<void>;
  /** 지운 주제를 보던 패널을 닫는다. */
  onTopicDeleted(topicId: string): void;
  revealTopic(topicId: string): Promise<void>;
}

const SETTINGS_BUTTON = '설정 열기';

function openWriteSetting(): void {
  void vscode.commands.executeCommand('workbench.action.openSettings', 'arxivjs.enableWrite');
}

export function registerWriteCommands(host: WriteCommandHost, log: Logger): vscode.Disposable[] {
  /** 쓰기가 켜져 있고 데이터 폴더가 있으면 Library를 돌려준다. 아니면 안내하고 undefined */
  const writableLibrary = (): Library | undefined => {
    if (!host.isWriteEnabled()) {
      void vscode.window
        .showWarningMessage('ArxivJS: 데이터 폴더 쓰기 기능이 꺼져 있습니다. 설정 arxivjs.enableWrite를 켜세요.', SETTINGS_BUTTON)
        .then((b) => b === SETTINGS_BUTTON && openWriteSetting());
      return undefined;
    }
    const library = host.getLibrary();
    if (!library) {
      void vscode.window.showWarningMessage('ArxivJS: 데이터 폴더를 먼저 설정하세요.');
    }
    return library;
  };

  const reportError = (action: string, err: unknown) => {
    log.error(`${action} 실패: ${err instanceof DataError ? `${err.kind}: ${err.message} (${err.path})` : String(err)}`);
    if (err instanceof DataError && err.kind === 'writeDisabled') {
      void vscode.window
        .showWarningMessage('ArxivJS: 데이터 폴더 쓰기 기능이 꺼져 있습니다.', SETTINGS_BUTTON)
        .then((b) => b === SETTINGS_BUTTON && openWriteSetting());
      return;
    }
    const reason =
      err instanceof DataError && err.kind === 'conflict'
        ? err.message
        : err instanceof DataError && err.kind === 'notFound'
          ? '대상이 없습니다. 다른 앱이 바꿨을 수 있습니다. Reload 후 다시 시도하세요.'
          : '출력 채널 ArxivJS를 확인하세요.';
    void vscode.window.showErrorMessage(`ArxivJS: ${action}하지 못했습니다. ${reason}`);
  };

  /** 입력 중 이름 검사. 문제가 없으면 만들어질 폴더 이름을 알려 준다. */
  const topicNameValidator = (names: readonly string[], currentFolder?: string) => (value: string) => {
    if (!value.trim()) {
      return undefined;
    }
    const reason = checkTopicName(value, names, currentFolder);
    return reason ?? { message: `폴더 이름: ${toTopicFolderName(value)}`, severity: vscode.InputBoxValidationSeverity.Info };
  };

  const resolveTopic = async (node: TreeNode | undefined, title: string): Promise<Topic | undefined> =>
    node?.kind === 'topic' ? node.topic : host.pickTopic(title);

  return [
    vscode.commands.registerCommand('arxivjs.createTopic', async () => {
      const library = writableLibrary();
      if (!library) {
        return;
      }
      try {
        const names = await listRootNames(library.ops);
        const name = await vscode.window.showInputBox({
          title: 'ArxivJS: 주제 추가',
          prompt: '주제 이름. 영문, 숫자, 한글, 공백, 괄호, 하이픈을 쓸 수 있습니다.',
          validateInput: topicNameValidator(names),
        });
        if (!name?.trim()) {
          return;
        }
        const folder = await createTopic(library.ops, name);
        log.info(`주제 추가: ${folder}`);
        host.reloadAll();
        await host.revealTopic(folder);
      } catch (err) {
        reportError('주제를 추가', err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.renameTopic', async (node?: TreeNode) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, '주제 이름 변경: 주제 선택'));
      if (!library || !topic) {
        return;
      }
      try {
        const names = await listRootNames(library.ops);
        const name = await vscode.window.showInputBox({
          title: `ArxivJS: 주제 이름 변경 — ${topic.label}`,
          prompt: '새 주제 이름. 폴더 안의 파일 이름은 바뀌지 않습니다.',
          value: topic.label,
          validateInput: topicNameValidator(names, topic.id),
        });
        if (!name?.trim()) {
          return;
        }
        const folder = await renameTopic(library.ops, topic.id, name);
        log.info(`주제 이름 변경: ${topic.id} → ${folder}`);
        host.reloadAll();
        await host.onTopicRenamed(topic.id, folder);
        await host.revealTopic(folder);
      } catch (err) {
        reportError('주제 이름을 변경', err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.deleteTopic', async (node?: TreeNode) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, '주제 삭제: 주제 선택'));
      if (!library || !topic) {
        return;
      }
      try {
        // 확인을 받기 전에 먼저 알린다. deleteTopic도 지우기 직전에 다시 확인한다.
        const names = (await library.ops.fs.readDir(topic.path)).map((e) => e.name);
        if (names.length > 0) {
          void vscode.window.showErrorMessage(
            `ArxivJS: 주제 "${topic.label}"은(는) 비어 있지 않아 지울 수 없습니다 (${summarizeEntries(names)}). 논문을 모두 옮기거나 지운 뒤 다시 시도하세요.`,
          );
          return;
        }
      } catch (err) {
        reportError('주제를 삭제', err);
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `주제 "${topic.label}"을(를) 지울까요?`,
        { modal: true, detail: `빈 폴더를 지웁니다: ${topic.path}` },
        '삭제',
      );
      if (confirm !== '삭제') {
        return;
      }
      try {
        await deleteTopic(library.ops, topic.id);
        log.info(`주제 삭제: ${topic.id}`);
        host.onTopicDeleted(topic.id);
        host.reloadAll();
      } catch (err) {
        reportError('주제를 삭제', err);
      }
    }),
  ];
}
