// 쓰기 명령 (DEV-PLAN §3.2.2): 입력 UI, 확인 대화상자, 쓰기 후 다시 읽기.
// 실제 파일 작업은 src/data/topicOps.ts → DataWriter가 한다. 논문 명령은 paperCommands.ts, 요약 명령은 summaryCommands.ts에 있다.
import * as vscode from 'vscode';
import { DataError } from '../data/errors';
import type { Library } from '../data/library';
import type { Topic } from '../data/models';
import { messagesFor, t, type Messages } from '../i18n';
import { checkTopicName, createTopic, deleteTopic, listRootNames, renameTopic, summarizeEntries } from '../data/topicOps';
import { toTopicFolderName } from '../util/displayName';
import type { Logger } from '../util/logger';
import type { TreeNode } from '../views/topicTreeProvider';
import { registerPaperCommands, type PaperCommandHost } from './paperCommands';
import { registerSummaryCommands, type SummaryCommandHost } from './summaryCommands';

export interface WriteCommandHost extends PaperCommandHost, SummaryCommandHost {
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

/** reportError()의 동작 이름. 알림은 현재 언어, 로그는 영어로 쓴다. */
export type ActionText = (m: Messages) => string;

function openWriteSetting(): void {
  void vscode.commands.executeCommand('workbench.action.openSettings', 'arxivjs.enableWrite');
}

export function registerWriteCommands(host: WriteCommandHost, log: Logger): vscode.Disposable[] {
  /** 쓰기가 켜져 있고 데이터 폴더가 있으면 Library를 돌려준다. 아니면 안내하고 undefined */
  const writableLibrary = (): Library | undefined => {
    if (!host.isWriteEnabled()) {
      const settingsButton = t().common.openSettings;
      void vscode.window
        .showWarningMessage(`ArxivJS: ${t().write.writeDisabledEnable}`, settingsButton)
        .then((b) => b === settingsButton && openWriteSetting());
      return undefined;
    }
    const library = host.getLibrary();
    if (!library) {
      void vscode.window.showWarningMessage(`ArxivJS: ${t().common.setDataFolderFirst}`);
    }
    return library;
  };

  const reportError = (action: ActionText, err: unknown) => {
    log.error(`Failed to ${action(messagesFor('en'))}: ${err instanceof DataError ? `${err.kind}: ${err.message} (${err.path})` : String(err)}`);
    if (err instanceof DataError && err.kind === 'writeDisabled') {
      const settingsButton = t().common.openSettings;
      void vscode.window
        .showWarningMessage(`ArxivJS: ${t().write.writeDisabled}`, settingsButton)
        .then((b) => b === settingsButton && openWriteSetting());
      return;
    }
    const reason =
      err instanceof DataError && err.kind === 'conflict'
        ? err.message
        : err instanceof DataError && err.kind === 'notFound'
          ? t().write.targetMissing
          : t().common.seeOutput;
    void vscode.window.showErrorMessage(`ArxivJS: ${t().write.failed(action(t()), reason)}`);
  };

  /** 입력 중 이름 검사. 문제가 없으면 만들어질 폴더 이름을 알려 준다. */
  const topicNameValidator = (names: readonly string[], currentFolder?: string) => (value: string) => {
    if (!value.trim()) {
      return undefined;
    }
    const reason = checkTopicName(value, names, currentFolder);
    return reason ?? { message: t().write.folderName(toTopicFolderName(value)), severity: vscode.InputBoxValidationSeverity.Info };
  };

  const resolveTopic = async (node: TreeNode | undefined, title: string): Promise<Topic | undefined> =>
    node?.kind === 'topic' ? node.topic : host.pickTopic(title);

  return [
    ...registerPaperCommands(host, { writableLibrary, reportError }, log),
    ...registerSummaryCommands(host, { writableLibrary, reportError }, log),

    vscode.commands.registerCommand('arxivjs.createTopic', async () => {
      const library = writableLibrary();
      if (!library) {
        return;
      }
      try {
        const names = await listRootNames(library.ops);
        const name = await vscode.window.showInputBox({
          title: t().write.addTopicTitle,
          prompt: t().write.addTopicPrompt,
          validateInput: topicNameValidator(names),
        });
        if (!name?.trim()) {
          return;
        }
        const folder = await createTopic(library.ops, name);
        log.info(`Added topic: ${folder}`);
        host.reloadAll();
        await host.revealTopic(folder);
      } catch (err) {
        reportError((msg) => msg.action.addTopic, err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.renameTopic', async (node?: TreeNode) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, t().write.renameTopicPick));
      if (!library || !topic) {
        return;
      }
      try {
        const names = await listRootNames(library.ops);
        const name = await vscode.window.showInputBox({
          title: t().write.renameTopicTitle(topic.label),
          prompt: t().write.renameTopicPrompt,
          value: topic.label,
          validateInput: topicNameValidator(names, topic.id),
        });
        if (!name?.trim()) {
          return;
        }
        const folder = await renameTopic(library.ops, topic.id, name);
        log.info(`Renamed topic: ${topic.id} → ${folder}`);
        host.reloadAll();
        await host.onTopicRenamed(topic.id, folder);
        await host.revealTopic(folder);
      } catch (err) {
        reportError((msg) => msg.action.renameTopic, err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.deleteTopic', async (node?: TreeNode) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, t().write.deleteTopicPick));
      if (!library || !topic) {
        return;
      }
      try {
        // 확인을 받기 전에 먼저 알린다. deleteTopic도 지우기 직전에 다시 확인한다.
        const names = (await library.ops.fs.readDir(topic.path)).map((e) => e.name);
        if (names.length > 0) {
          void vscode.window.showErrorMessage(`ArxivJS: ${t().write.topicNotEmpty(topic.label, summarizeEntries(names))}`);
          return;
        }
      } catch (err) {
        reportError((msg) => msg.action.deleteTopic, err);
        return;
      }
      const deleteButton = t().common.delete;
      const confirm = await vscode.window.showWarningMessage(
        t().write.confirmDeleteTopic(topic.label),
        { modal: true, detail: t().write.deleteTopicDetail(topic.path) },
        deleteButton,
      );
      if (confirm !== deleteButton) {
        return;
      }
      try {
        await deleteTopic(library.ops, topic.id);
        log.info(`Deleted topic: ${topic.id}`);
        host.onTopicDeleted(topic.id);
        host.reloadAll();
      } catch (err) {
        reportError((msg) => msg.action.deleteTopic, err);
      }
    }),
  ];
}
