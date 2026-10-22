// 논문 쓰기 명령 (DEV-PLAN §3.2.2, §6.6.2–6.6.6): 추가, 메타 정보 편집, 이동, 삭제, 요약 삭제.
// 실제 파일 작업은 src/data/paperOps.ts → DataWriter가 한다.
import * as vscode from 'vscode';
import type { Library } from '../data/library';
import { EMPTY_FORM, parseMetaForm, toFormValues, toMetaPatch } from '../data/metaForm';
import type { Paper, Topic } from '../data/models';
import { isValidPaperId } from '../data/paperId';
import { t } from '../i18n';
import {
  deletePaper,
  deleteSummary,
  movePaper,
  paperExists,
  readPaperMeta,
  resolvePaperId,
  savePaper,
  updateMeta,
} from '../data/paperOps';
import { fetchArxivById, parseArxivId, searchArxiv, type ArxivEntry, type FetchFn } from '../sources/arxiv';
import type { Logger } from '../util/logger';
import { ellipsize } from '../views/format';
import type { MetaEditPanelManager } from '../views/metaEditPanel';
import type { TreeNode } from '../views/topicTreeProvider';
import type { ActionText } from './writeCommands';

export interface PaperTarget {
  topic: Topic;
  paper: Paper;
}

export interface PaperCommandHost {
  pickTopic(title: string): Promise<Topic | undefined>;
  /** 명령 인자(트리 노드, Paper 패널의 대상)나 활성 Paper 패널에서 논문을 찾는다. */
  resolvePaper(arg: unknown): PaperTarget | undefined;
  /** 주제의 논문 목록이 바뀌었다: 캐시를 비우고 트리, 홈, Topic 패널을 다시 그린다. */
  reloadTopic(topicId: string): void;
  /** 논문 파일이 바뀌었다: 주제를 다시 읽고 열린 Paper 패널을 다시 그린다. */
  reloadPaper(target: PaperTarget): Promise<void>;
  /** 논문이 사라졌다(이동, 삭제): 그 논문의 Paper 패널을 닫는다. */
  closePaper(paperId: string): void;
  openPaper(topic: Topic, stem: string): Promise<void>;
  metaEditor: MetaEditPanelManager;
  fetch: FetchFn;
}

/** writeCommands.ts가 넘겨주는 공용 도우미 */
export interface WriteHelpers {
  writableLibrary(): Library | undefined;
  reportError(action: ActionText, err: unknown): void;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** 쓰기 대상 논문을 찾는다. .json이 없는 논문(md만 있음)은 쓰기 기능을 쓰지 않는다 (DEV-PLAN §2.4). */
export function writablePaperResolver(host: Pick<PaperCommandHost, 'resolvePaper'>): (arg: unknown) => PaperTarget | undefined {
  return (arg) => {
    const target = host.resolvePaper(arg);
    if (!target) {
      void vscode.window.showInformationMessage(`ArxivJS: ${t().paperCmd.pickPaper}`);
      return undefined;
    }
    if (!target.paper.jsonPath) {
      void vscode.window.showWarningMessage(`ArxivJS: ${t().paperCmd.noMetaCannotEdit}`);
      return undefined;
    }
    return target;
  };
}

export function registerPaperCommands(host: PaperCommandHost, helpers: WriteHelpers, log: Logger): vscode.Disposable[] {
  const { writableLibrary, reportError } = helpers;

  const resolveTopic = async (node: unknown, title: string): Promise<Topic | undefined> => {
    const n = node as TreeNode | undefined;
    return n?.kind === 'topic' ? n.topic : host.pickTopic(title);
  };

  const resolveWritablePaper = writablePaperResolver(host);

  /** 진행률 알림을 띄우고 취소할 수 있게 실행한다. 취소하면 undefined */
  const withCancellableProgress = <T>(title: string, task: (signal: AbortSignal) => Promise<T>): Thenable<T | undefined> =>
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (_p, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      try {
        return await task(controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          return undefined;
        }
        throw err;
      }
    });

  /** 제목 slug가 비었을 때 파일 이름을 묻는다 (형식 명세 §7.3). */
  const askPaperId = (title: string): Thenable<string | undefined> =>
    vscode.window.showInputBox({
      title: t().paperCmd.enterFileNameTitle(ellipsize(title, 60)),
      prompt: t().paperCmd.enterFileNamePrompt,
      validateInput: (v) => (v === '' || isValidPaperId(v) ? undefined : t().paperCmd.fileNameInvalid),
    });

  /** arXiv에서 얻은 논문을 저장한다. 이미 있는 논문은 한 번에 묻는다(기본 건너뛰기). */
  const saveEntries = async (library: Library, topic: Topic, entries: ArxivEntry[]): Promise<void> => {
    const ctx = library.ops;
    const existing = new Set<ArxivEntry>();
    for (const e of entries) {
      const id = resolvePaperId(e.paper.title);
      if (id && (await paperExists(ctx, topic, id))) {
        existing.add(e);
      }
    }
    let overwrite = false;
    if (existing.size > 0) {
      const titles = [...existing].slice(0, 5).map((e) => `• ${ellipsize(e.paper.title, 80)}`);
      const m = t().paperCmd;
      const choice = await vscode.window.showWarningMessage(
        m.existing(existing.size, topic.label),
        { modal: true, detail: m.overwriteDetail(`${titles.join('\n')}${existing.size > 5 ? '\n…' : ''}`) },
        m.skip,
        m.overwrite,
      );
      if (!choice) {
        return;
      }
      overwrite = choice === m.overwrite;
    }

    const added: string[] = [];
    let skipped = 0;
    for (const e of entries) {
      if (existing.has(e) && !overwrite) {
        skipped++;
        continue;
      }
      let paperId = resolvePaperId(e.paper.title);
      if (!paperId) {
        paperId = await askPaperId(e.paper.title);
        if (!paperId) {
          skipped++;
          continue;
        }
        if (await paperExists(ctx, topic, paperId)) {
          void vscode.window.showWarningMessage(`ArxivJS: ${t().paperCmd.duplicateSkipped(paperId)}`);
          skipped++;
          continue;
        }
      }
      try {
        added.push(await savePaper(ctx, topic, e.paper, { paperId, overwrite: existing.has(e) }));
        log.info(`Added paper: ${topic.id}/${paperId} (arXiv ${e.arxivId})`);
      } catch (err) {
        reportError((msg) => msg.action.addPaperTitled(ellipsize(e.paper.title, 40)), err);
      }
    }
    if (added.length > 0) {
      host.reloadTopic(topic.id);
    }
    if (added.length === 1 && entries.length === 1) {
      await host.openPaper(topic, added[0]);
    }
    void vscode.window.showInformationMessage(`ArxivJS: ${t().paperCmd.addedSummary(added.length, skipped)}`);
  };

  const addFromSearch = async (library: Library, topic: Topic): Promise<void> => {
    const keywords = await vscode.window.showInputBox({
      title: t().paperCmd.searchTitle(topic.label),
      prompt: t().paperCmd.searchPrompt,
      placeHolder: t().paperCmd.searchPlaceholder,
    });
    if (!keywords?.trim()) {
      return;
    }
    const entries = await withCancellableProgress(t().paperCmd.searching, (signal) =>
      searchArxiv(keywords, { fetch: host.fetch, signal }),
    );
    if (!entries) {
      return;
    }
    if (entries.length === 0) {
      void vscode.window.showInformationMessage(`ArxivJS: ${t().paperCmd.noResults(keywords)}`);
      return;
    }
    const stems = new Set((await library.papers.list(topic)).map((p) => p.stem));
    const picked = await vscode.window.showQuickPick(
      entries.map((e) => {
        const id = resolvePaperId(e.paper.title);
        const has = id !== undefined && stems.has(id);
        return {
          label: e.paper.title,
          description: `${e.paper.year} · ${e.arxivId}${has ? ` · ${t().paperCmd.alreadyAdded}` : ''}`,
          detail: ellipsize(e.paper.authors, 120),
          entry: e,
        };
      }),
      {
        title: t().paperCmd.resultsTitle(entries.length),
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (picked && picked.length > 0) {
      await saveEntries(library, topic, picked.map((p) => p.entry));
    }
  };

  const addFromId = async (library: Library, topic: Topic): Promise<void> => {
    const input = await vscode.window.showInputBox({
      title: t().paperCmd.idTitle(topic.label),
      prompt: t().paperCmd.idPrompt,
      placeHolder: t().paperCmd.idPlaceholder,
      validateInput: (v) => (v.trim() === '' || parseArxivId(v) ? undefined : t().paperCmd.idInvalid),
    });
    const arxivId = input ? parseArxivId(input) : undefined;
    if (!arxivId) {
      return;
    }
    // 취소(undefined)와 찾지 못함({ entry: undefined })을 구분한다.
    const result = await withCancellableProgress(t().paperCmd.fetchingId(arxivId), async (signal) => ({
      entry: await fetchArxivById(arxivId, { fetch: host.fetch, signal }),
    }));
    if (!result) {
      return;
    }
    if (!result.entry) {
      void vscode.window.showWarningMessage(`ArxivJS: ${t().paperCmd.idNotFound(arxivId)}`);
      return;
    }
    await saveEntries(library, topic, [result.entry]);
  };

  const addManually = (library: Library, topic: Topic): void => {
    host.metaEditor.show({
      heading: t().paperCmd.addPaperHeading(topic.label),
      subheading: topic.path,
      mode: 'add',
      initial: EMPTY_FORM,
      save: async (values) => {
        const parsed = parseMetaForm(values, 'add');
        if (!parsed.ok) {
          return { errors: parsed.errors };
        }
        const ctx = library.ops;
        const paperId = resolvePaperId(parsed.paper.title, parsed.paperId)!;
        if (await paperExists(ctx, topic, paperId)) {
          return { message: t().paperCmd.duplicateManual(paperId) };
        }
        try {
          await savePaper(ctx, topic, parsed.paper, { paperId });
        } catch (err) {
          reportError((msg) => msg.action.addPaper, err);
          return { message: t().paperCmd.saveFailed(errorText(err)) };
        }
        log.info(`Added paper: ${topic.id}/${paperId} (manual entry)`);
        host.reloadTopic(topic.id);
        await host.openPaper(topic, paperId);
        return undefined;
      },
    });
  };

  return [
    vscode.commands.registerCommand('arxivjs.addPaper', async (node?: unknown) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, t().paperCmd.addPaperPick));
      if (!library || !topic) {
        return;
      }
      const m = t().paperCmd;
      const method = await vscode.window.showQuickPick(
        [
          { id: 'search', label: m.methodSearch, detail: m.methodSearchDetail },
          { id: 'id', label: m.methodId, detail: m.idPlaceholder },
          { id: 'manual', label: m.methodManual, detail: m.methodManualDetail },
        ],
        { title: m.addPaperHeading(topic.label) },
      );
      try {
        if (method?.id === 'search') {
          await addFromSearch(library, topic);
        } else if (method?.id === 'id') {
          await addFromId(library, topic);
        } else if (method?.id === 'manual') {
          addManually(library, topic);
        }
      } catch (err) {
        reportError((msg) => msg.action.addPaper, err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.editPaperMeta', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { paper } = target;
      let initial;
      try {
        initial = toFormValues(await readPaperMeta(library.ops, paper));
      } catch (err) {
        reportError((msg) => msg.action.readMeta, err);
        return;
      }
      host.metaEditor.show({
        heading: t().paperCmd.editMetaHeading(ellipsize(paper.meta.title, 40)),
        subheading: paper.jsonPath,
        mode: 'edit',
        initial,
        save: async (values) => {
          const parsed = parseMetaForm(values, 'edit');
          if (!parsed.ok) {
            return { errors: parsed.errors };
          }
          const patch = toMetaPatch(initial, values, parsed.paper);
          if (Object.keys(patch).length === 0) {
            return undefined; // 바뀐 것이 없다.
          }
          try {
            await updateMeta(library.ops, paper, patch);
          } catch (err) {
            reportError((msg) => msg.action.saveMeta, err);
            return { message: t().paperCmd.saveFailed(errorText(err)) };
          }
          log.info(`Updated metadata: ${paper.id} (${Object.keys(patch).join(', ')})`);
          await host.reloadPaper(target);
          return undefined;
        },
      });
    }),

    vscode.commands.registerCommand('arxivjs.movePaper', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { topic: from, paper } = target;
      try {
        const topics = (await library.topics.list()).filter((t) => t.id !== from.id);
        const picked = await vscode.window.showQuickPick(
          topics.map((t) => ({ label: t.label, description: t.id, topic: t })),
          { title: t().paperCmd.moveTitle(ellipsize(paper.meta.title, 50)), placeHolder: t().paperCmd.movePlaceholder, matchOnDescription: true },
        );
        if (!picked) {
          return;
        }
        const to = picked.topic;
        if (await paperExists(library.ops, to, paper.stem)) {
          const m = t().paperCmd;
          const choice = await vscode.window.showWarningMessage(
            m.moveConflict(to.label),
            { modal: true, detail: m.moveConflictDetail },
            m.continue,
          );
          if (choice !== m.continue) {
            return;
          }
        }
        const result = await movePaper(library.ops, paper, from, to);
        log.info(`Moved paper: ${paper.id} → ${to.id} (${result})`);
        host.closePaper(paper.id);
        host.reloadTopic(from.id);
        host.reloadTopic(to.id);
        const text =
          result === 'keptTarget' ? t().paperCmd.movedKeptTarget(to.label, from.label) : t().paperCmd.moved(to.label);
        void vscode.window.showInformationMessage(`ArxivJS: ${text}`);
      } catch (err) {
        reportError((msg) => msg.action.movePaper, err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.deletePaper', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { topic, paper } = target;
      const manual = paper.meta.source === 'manual';
      const m = t().paperCmd;
      const deleteButton = t().common.delete;
      const choice = await vscode.window.showWarningMessage(
        m.confirmDeletePaper(ellipsize(paper.meta.title, 60)),
        { modal: true, detail: m.deletePaperDetail(paper.stem) + (manual ? m.manualWarning : '') },
        deleteButton,
      );
      if (choice !== deleteButton) {
        return;
      }
      try {
        await deletePaper(library.ops, paper, topic);
        log.info(`Deleted paper: ${paper.id}`);
        host.closePaper(paper.id);
        host.reloadTopic(topic.id);
      } catch (err) {
        reportError((msg) => msg.action.deletePaper, err);
      }
    }),

    vscode.commands.registerCommand('arxivjs.deleteSummary', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { topic, paper } = target;
      if (!paper.mdPath) {
        void vscode.window.showInformationMessage(`ArxivJS: ${t().paperCmd.noSummary}`);
        return;
      }
      const deleteButton = t().common.delete;
      const choice = await vscode.window.showWarningMessage(
        t().paperCmd.confirmDeleteSummary(ellipsize(paper.meta.title, 60)),
        { modal: true, detail: t().paperCmd.deleteSummaryDetail(paper.stem) },
        deleteButton,
      );
      if (choice !== deleteButton) {
        return;
      }
      try {
        await deleteSummary(library.ops, paper, topic);
        log.info(`Deleted summary: ${paper.id}`);
        await host.reloadPaper(target);
      } catch (err) {
        reportError((msg) => msg.action.deleteSummary, err);
      }
    }),
  ];
}
