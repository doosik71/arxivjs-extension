// 논문 쓰기 명령 (DEV-PLAN §3.2.2, §6.6.2–6.6.6): 추가, 메타 정보 편집, 이동, 삭제, 요약 삭제.
// 실제 파일 작업은 src/data/paperOps.ts → DataWriter가 한다.
import * as vscode from 'vscode';
import type { Library } from '../data/library';
import { EMPTY_FORM, parseMetaForm, toFormValues, toMetaPatch } from '../data/metaForm';
import type { Paper, Topic } from '../data/models';
import { isValidPaperId } from '../data/paperId';
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
  reportError(action: string, err: unknown): void;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function registerPaperCommands(host: PaperCommandHost, helpers: WriteHelpers, log: Logger): vscode.Disposable[] {
  const { writableLibrary, reportError } = helpers;

  const resolveTopic = async (node: unknown, title: string): Promise<Topic | undefined> => {
    const n = node as TreeNode | undefined;
    return n?.kind === 'topic' ? n.topic : host.pickTopic(title);
  };

  /** 쓰기 대상 논문. .json이 없는 논문(md만 있음)은 쓰기 기능을 쓰지 않는다 (DEV-PLAN §2.4). */
  const resolveWritablePaper = (arg: unknown): PaperTarget | undefined => {
    const target = host.resolvePaper(arg);
    if (!target) {
      void vscode.window.showInformationMessage('ArxivJS: 대상 논문을 트리나 Paper 패널에서 고르세요.');
      return undefined;
    }
    if (!target.paper.jsonPath) {
      void vscode.window.showWarningMessage('ArxivJS: 메타 정보(.json)가 없는 논문은 편집할 수 없습니다.');
      return undefined;
    }
    return target;
  };

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
      title: `파일 이름 입력 — ${ellipsize(title, 60)}`,
      prompt: '제목에 영문이나 숫자가 없어 파일 이름을 만들 수 없습니다. a-z, 0-9, _로 입력하세요.',
      validateInput: (v) => (v === '' || isValidPaperId(v) ? undefined : 'a-z, 0-9, _만 쓸 수 있고 앞뒤에 _를 쓸 수 없습니다.'),
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
      const choice = await vscode.window.showWarningMessage(
        `${existing.size}편은 주제 "${topic.label}"에 같은 파일 이름으로 이미 있습니다.`,
        { modal: true, detail: `${titles.join('\n')}${existing.size > 5 ? '\n…' : ''}\n\n덮어쓰면 기존 메타 정보(.json)가 arXiv 정보로 바뀝니다. 인용 수 등 직접 넣은 값은 사라집니다.` },
        '건너뛰기',
        '덮어쓰기',
      );
      if (!choice) {
        return;
      }
      overwrite = choice === '덮어쓰기';
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
          void vscode.window.showWarningMessage(`ArxivJS: 같은 파일 이름의 논문이 이미 있어 건너뜁니다: ${paperId}`);
          skipped++;
          continue;
        }
      }
      try {
        added.push(await savePaper(ctx, topic, e.paper, { paperId, overwrite: existing.has(e) }));
        log.info(`논문 추가: ${topic.id}/${paperId} (arXiv ${e.arxivId})`);
      } catch (err) {
        reportError(`논문 "${ellipsize(e.paper.title, 40)}"을(를) 추가`, err);
      }
    }
    if (added.length > 0) {
      host.reloadTopic(topic.id);
    }
    if (added.length === 1 && entries.length === 1) {
      await host.openPaper(topic, added[0]);
    }
    const parts = [`논문 ${added.length}편을 추가했습니다`];
    if (skipped > 0) {
      parts.push(`${skipped}편은 건너뛰었습니다`);
    }
    void vscode.window.showInformationMessage(`ArxivJS: ${parts.join(', ')}.`);
  };

  const addFromSearch = async (library: Library, topic: Topic): Promise<void> => {
    const keywords = await vscode.window.showInputBox({
      title: `arXiv 검색 — ${topic.label}`,
      prompt: '검색어. 낱말이 모두 들어 있는 논문을 관련도순으로 찾습니다.',
      placeHolder: '예: few-shot classification',
    });
    if (!keywords?.trim()) {
      return;
    }
    const entries = await withCancellableProgress('ArxivJS: arXiv 검색 중…', (signal) =>
      searchArxiv(keywords, { fetch: host.fetch, signal }),
    );
    if (!entries) {
      return;
    }
    if (entries.length === 0) {
      void vscode.window.showInformationMessage(`ArxivJS: "${keywords}"에 맞는 arXiv 논문이 없습니다.`);
      return;
    }
    const stems = new Set((await library.papers.list(topic)).map((p) => p.stem));
    const picked = await vscode.window.showQuickPick(
      entries.map((e) => {
        const id = resolvePaperId(e.paper.title);
        const has = id !== undefined && stems.has(id);
        return {
          label: e.paper.title,
          description: `${e.paper.year} · ${e.arxivId}${has ? ' · 이미 있음' : ''}`,
          detail: ellipsize(e.paper.authors, 120),
          entry: e,
        };
      }),
      {
        title: `arXiv 검색 결과 ${entries.length}편 — 추가할 논문을 고르세요`,
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
      title: `arXiv URL·ID로 추가 — ${topic.label}`,
      prompt: 'arXiv ID나 URL',
      placeHolder: '예: 2310.16485, https://arxiv.org/abs/2310.16485',
      validateInput: (v) => (v.trim() === '' || parseArxivId(v) ? undefined : 'arXiv ID나 arxiv.org/abs/… 주소를 입력하세요.'),
    });
    const arxivId = input ? parseArxivId(input) : undefined;
    if (!arxivId) {
      return;
    }
    // 취소(undefined)와 찾지 못함({ entry: undefined })을 구분한다.
    const result = await withCancellableProgress(`ArxivJS: arXiv ${arxivId} 조회 중…`, async (signal) => ({
      entry: await fetchArxivById(arxivId, { fetch: host.fetch, signal }),
    }));
    if (!result) {
      return;
    }
    if (!result.entry) {
      void vscode.window.showWarningMessage(`ArxivJS: arXiv에서 ${arxivId}를 찾지 못했습니다.`);
      return;
    }
    await saveEntries(library, topic, [result.entry]);
  };

  const addManually = (library: Library, topic: Topic): void => {
    host.metaEditor.show({
      heading: `논문 추가 — ${topic.label}`,
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
          return { message: `이 주제에 같은 파일 이름(${paperId})의 논문이 이미 있습니다. 제목을 바꾸거나 기존 논문의 메타 정보를 편집하세요.` };
        }
        try {
          await savePaper(ctx, topic, parsed.paper, { paperId });
        } catch (err) {
          reportError('논문을 추가', err);
          return { message: `저장하지 못했습니다: ${errorText(err)}` };
        }
        log.info(`논문 추가: ${topic.id}/${paperId} (직접 입력)`);
        host.reloadTopic(topic.id);
        await host.openPaper(topic, paperId);
        return undefined;
      },
    });
  };

  return [
    vscode.commands.registerCommand('arxivjs.addPaper', async (node?: unknown) => {
      const library = writableLibrary();
      const topic = library && (await resolveTopic(node, '논문 추가: 주제 선택'));
      if (!library || !topic) {
        return;
      }
      const method = await vscode.window.showQuickPick(
        [
          { id: 'search', label: '$(search) arXiv 검색', detail: '검색어로 arXiv 논문을 찾아 여러 편을 한꺼번에 추가합니다.' },
          { id: 'id', label: '$(link) arXiv URL·ID', detail: '예: 2310.16485, https://arxiv.org/abs/2310.16485' },
          { id: 'manual', label: '$(edit) 직접 입력', detail: '제목, 저자, 연도 등을 직접 입력합니다.' },
        ],
        { title: `논문 추가 — ${topic.label}` },
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
        reportError('논문을 추가', err);
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
        reportError('메타 정보를 읽', err);
        return;
      }
      host.metaEditor.show({
        heading: `메타 정보 편집 — ${ellipsize(paper.meta.title, 40)}`,
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
            reportError('메타 정보를 저장', err);
            return { message: `저장하지 못했습니다: ${errorText(err)}` };
          }
          log.info(`메타 정보 수정: ${paper.id} (${Object.keys(patch).join(', ')})`);
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
          { title: `논문 이동 — ${ellipsize(paper.meta.title, 50)}`, placeHolder: '옮길 주제', matchOnDescription: true },
        );
        if (!picked) {
          return;
        }
        const to = picked.topic;
        if (await paperExists(library.ops, to, paper.stem)) {
          const choice = await vscode.window.showWarningMessage(
            `주제 "${to.label}"에 같은 파일 이름의 논문이 이미 있습니다.`,
            {
              modal: true,
              detail:
                '추가 날짜(dateAdded)를 비교해 더 최신인 쪽을 남깁니다. 날짜가 없거나 같으면 대상 주제의 논문을 남기고 이 논문은 지웁니다 (전문 텍스트 .txt는 대상에 없을 때만 옮깁니다).',
            },
            '계속',
          );
          if (choice !== '계속') {
            return;
          }
        }
        const result = await movePaper(library.ops, paper, from, to);
        log.info(`논문 이동: ${paper.id} → ${to.id} (${result})`);
        host.closePaper(paper.id);
        host.reloadTopic(from.id);
        host.reloadTopic(to.id);
        const text =
          result === 'keptTarget'
            ? `주제 "${to.label}"의 기존 논문을 남기고, 이 논문은 "${from.label}"에서 지웠습니다.`
            : `논문을 "${to.label}"(으)로 옮겼습니다.`;
        void vscode.window.showInformationMessage(`ArxivJS: ${text}`);
      } catch (err) {
        reportError('논문을 이동', err);
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
      const choice = await vscode.window.showWarningMessage(
        `논문 "${ellipsize(paper.meta.title, 60)}"을(를) 지울까요?`,
        {
          modal: true,
          detail:
            `${paper.stem}의 .json, .md, .hlt, .txt 파일을 지웁니다. 되돌릴 수 없습니다.` +
            (manual ? '\n이 논문은 직접 추가한 논문(manual)입니다. 전문 텍스트(.txt)는 다시 만들 수 없습니다.' : ''),
        },
        '삭제',
      );
      if (choice !== '삭제') {
        return;
      }
      try {
        await deletePaper(library.ops, paper, topic);
        log.info(`논문 삭제: ${paper.id}`);
        host.closePaper(paper.id);
        host.reloadTopic(topic.id);
      } catch (err) {
        reportError('논문을 삭제', err);
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
        void vscode.window.showInformationMessage('ArxivJS: 이 논문에는 요약 문서(.md)가 없습니다.');
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `논문 "${ellipsize(paper.meta.title, 60)}"의 요약 문서를 지울까요?`,
        { modal: true, detail: `${paper.stem}.md와 하이라이트(.hlt)를 지웁니다. 백업을 남기지 않으므로 되돌릴 수 없습니다.` },
        '삭제',
      );
      if (choice !== '삭제') {
        return;
      }
      try {
        await deleteSummary(library.ops, paper, topic);
        log.info(`요약 삭제: ${paper.id}`);
        await host.reloadPaper(target);
      } catch (err) {
        reportError('요약 문서를 삭제', err);
      }
    }),
  ];
}
