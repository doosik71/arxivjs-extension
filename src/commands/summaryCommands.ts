// AI 요약 명령 (DEV-PLAN §8): Gemini API 키 관리, 논문 요약, 주제 일괄 요약.
// 실제 작업은 src/llm/summarize.ts가 한다.
import * as vscode from 'vscode';
import type { Topic } from '../data/models';
import { LlmError } from '../llm/common';
import { checkLlmSettings, describeEngine, type LlmSettings } from '../llm/engine';
import { readPromptTemplate, summarizePaper, type SummaryStage } from '../llm/summarize';
import type { FetchFn } from '../sources/arxiv';
import { FullTextError, type PdfTextExtractor } from '../sources/fullText';
import type { Logger } from '../util/logger';
import { ellipsize } from '../views/format';
import type { TreeNode } from '../views/topicTreeProvider';
import { writablePaperResolver, type PaperTarget, type WriteHelpers } from './paperCommands';

/** SecretStorage 키 이름 (DEV-PLAN §8.2) */
export const GEMINI_KEY_SECRET = 'arxivjs.gemini.apiKey';
/** 일괄 요약에서 PDF를 내려받은 뒤 다음 논문까지 기다리는 시간 (arXiv 요청 간격 권고) */
const ARXIV_DELAY_MS = 3000;

export interface SummaryCommandHost {
  pickTopic(title: string): Promise<Topic | undefined>;
  resolvePaper(arg: unknown): PaperTarget | undefined;
  reloadTopic(topicId: string): void;
  reloadPaper(target: PaperTarget): Promise<void>;
  /** 설정과 SecretStorage에서 엔진 설정을 읽는다. */
  llmSettings(): Promise<LlmSettings>;
  secrets: vscode.SecretStorage;
  fetch: FetchFn;
  /** PDF 추출기 (dist/pdfText.js를 처음 쓸 때 불러온다) */
  pdfExtractor(): PdfTextExtractor;
}

const stageText = (settings: LlmSettings, stage: SummaryStage, chars?: number) =>
  stage === 'text' ? '전문 텍스트 준비 중…' : `${describeEngine(settings)} 응답 받는 중… ${(chars ?? 0).toLocaleString('en-US')}자`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function registerSummaryCommands(host: SummaryCommandHost, helpers: WriteHelpers, log: Logger): vscode.Disposable[] {
  const { writableLibrary, reportError } = helpers;
  const resolveWritablePaper = writablePaperResolver(host);
  /** 지금 요약 중인 논문 (같은 논문을 겹쳐 요약하지 않는다) */
  const running = new Set<string>();

  /** 엔진 설정이 모자라면 안내하고 undefined */
  const readySettings = async (): Promise<LlmSettings | undefined> => {
    const settings = await host.llmSettings();
    const problem = checkLlmSettings(settings);
    if (problem) {
      const action = settings.engine === 'gemini' && !settings.geminiApiKey ? 'API 키 설정' : '설정 열기';
      const choice = await vscode.window.showWarningMessage(`ArxivJS: ${problem}`, action);
      if (choice === 'API 키 설정') {
        await vscode.commands.executeCommand('arxivjs.setGeminiApiKey');
      } else if (choice === '설정 열기') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'arxivjs.llm');
      }
      return undefined;
    }
    return settings;
  };

  /** 사용자에게 보일 이유가 있는 오류(LLM, 전문 텍스트)는 그대로, 나머지는 공용 처리 */
  const reportSummaryError = (title: string, err: unknown) => {
    if (err instanceof LlmError || err instanceof FullTextError) {
      log.error(`요약 실패: ${title} — ${err.message}`);
      void vscode.window.showErrorMessage(`ArxivJS: 요약하지 못했습니다. ${err.message}`);
    } else {
      reportError('요약', err);
    }
  };

  return [
    vscode.commands.registerCommand('arxivjs.setGeminiApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'ArxivJS: Gemini API 키 설정',
        prompt: 'Google AI Studio(https://aistudio.google.com/apikey)에서 만든 키. OS 자격 증명 저장소(SecretStorage)에 저장합니다.',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (/\s/.test(v.trim()) ? '공백이 들어 있습니다.' : undefined),
      });
      if (!key?.trim()) {
        return;
      }
      await host.secrets.store(GEMINI_KEY_SECRET, key.trim());
      log.info('Gemini API 키를 저장했다.'); // 키 값은 기록하지 않는다.
      void vscode.window.showInformationMessage('ArxivJS: Gemini API 키를 저장했습니다.');
    }),

    vscode.commands.registerCommand('arxivjs.clearGeminiApiKey', async () => {
      await host.secrets.delete(GEMINI_KEY_SECRET);
      log.info('Gemini API 키를 지웠다.');
      void vscode.window.showInformationMessage('ArxivJS: Gemini API 키를 지웠습니다.');
    }),

    vscode.commands.registerCommand('arxivjs.summarizePaper', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { topic, paper } = target;
      if (running.has(paper.id)) {
        void vscode.window.showInformationMessage('ArxivJS: 이 논문은 이미 요약 중입니다.');
        return;
      }
      const settings = await readySettings();
      if (!settings) {
        return;
      }
      if (paper.mdPath) {
        const choice = await vscode.window.showWarningMessage(
          `논문 "${ellipsize(paper.meta.title, 60)}"의 요약을 다시 만들까요?`,
          { modal: true, detail: '기존 요약(.md)은 백업 없이 바뀝니다. 하이라이트(.hlt)는 새 요약과 맞지 않을 수 있습니다.' },
          '다시 만들기',
        );
        if (choice !== '다시 만들기') {
          return;
        }
      }
      running.add(paper.id);
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `ArxivJS: 요약 — ${ellipsize(paper.meta.title, 40)}`, cancellable: true },
          async (progress, token) => {
            const controller = new AbortController();
            token.onCancellationRequested(() => controller.abort());
            try {
              const result = await summarizePaper(library.ops, topic, paper, {
                settings,
                fetch: host.fetch,
                extract: host.pdfExtractor(),
                signal: controller.signal,
                onProgress: (stage, chars) => progress.report({ message: stageText(settings, stage, chars) }),
              });
              log.info(`요약 저장: ${paper.id} (${describeEngine(settings)}, ${result.chars}자)`);
              await host.reloadPaper(target);
              void vscode.window.showInformationMessage(`ArxivJS: 요약을 저장했습니다 (${result.chars.toLocaleString('en-US')}자).`);
            } catch (err) {
              if (controller.signal.aborted) {
                log.info(`요약 취소: ${paper.id}`);
                void vscode.window.showInformationMessage('ArxivJS: 요약을 취소했습니다. 요약 문서는 바뀌지 않았습니다.');
              } else {
                reportSummaryError(paper.id, err);
              }
            }
          },
        );
      } finally {
        running.delete(paper.id);
      }
    }),

    vscode.commands.registerCommand('arxivjs.summarizeTopic', async (node?: unknown) => {
      const library = writableLibrary();
      const n = node as TreeNode | undefined;
      const topic = library && (n?.kind === 'topic' ? n.topic : await host.pickTopic('요약 없는 논문 일괄 요약: 주제 선택'));
      if (!library || !topic) {
        return;
      }
      const settings = await readySettings();
      if (!settings) {
        return;
      }
      try {
        await readPromptTemplate(library.ops); // 프롬프트 문제는 시작 전에 알린다.
      } catch (err) {
        reportSummaryError(topic.id, err);
        return;
      }
      const papers = (await library.papers.list(topic)).filter((p) => p.jsonPath && !p.mdPath && !p.metaError && !running.has(p.id));
      if (papers.length === 0) {
        void vscode.window.showInformationMessage(`ArxivJS: 주제 "${topic.label}"에 요약 문서가 없는 논문이 없습니다.`);
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `주제 "${topic.label}"에서 요약 문서가 없는 논문 ${papers.length}편을 요약할까요?`,
        {
          modal: true,
          detail: `${describeEngine(settings)}로 한 편씩 차례로 요약합니다. 진행률 알림에서 취소할 수 있습니다. PDF를 내려받은 뒤에는 ${ARXIV_DELAY_MS / 1000}초씩 기다립니다(arXiv 요청 간격).`,
        },
        '요약',
      );
      if (choice !== '요약') {
        return;
      }

      let ok = 0;
      let failed = 0;
      let skipped = 0;
      let cancelled = false;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `ArxivJS: 일괄 요약 — ${topic.label}`, cancellable: true },
        async (progress, token) => {
          const controller = new AbortController();
          token.onCancellationRequested(() => controller.abort());
          for (const [i, paper] of papers.entries()) {
            if (controller.signal.aborted) {
              break;
            }
            const head = `${i + 1}/${papers.length} ${ellipsize(paper.meta.title, 40)}`;
            progress.report({ message: head });
            const fresh = await library.papers.reloadPaper(topic, paper.stem);
            if (!fresh?.jsonPath || fresh.mdPath || running.has(paper.id)) {
              skipped++; // 그사이 다른 앱이 지웠거나 요약을 만들었다.
              progress.report({ increment: 100 / papers.length });
              continue;
            }
            running.add(paper.id);
            try {
              const result = await summarizePaper(library.ops, topic, fresh, {
                settings,
                fetch: host.fetch,
                extract: host.pdfExtractor(),
                signal: controller.signal,
                onProgress: (stage, chars) => progress.report({ message: `${head} — ${stageText(settings, stage, chars)}` }),
              });
              ok++;
              log.info(`요약 저장: ${paper.id} (${describeEngine(settings)}, ${result.chars}자)`);
              await host.reloadPaper({ topic, paper: fresh });
              if (result.downloaded && i < papers.length - 1) {
                await delay(ARXIV_DELAY_MS);
              }
            } catch (err) {
              if (controller.signal.aborted) {
                break;
              }
              failed++;
              log.error(`요약 실패: ${paper.id} — ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              running.delete(paper.id);
            }
            progress.report({ increment: 100 / papers.length });
          }
          cancelled = controller.signal.aborted;
        },
      );
      host.reloadTopic(topic.id);
      const summary = `요약 ${ok}편 완료` + (failed ? `, 실패 ${failed}편` : '') + (skipped ? `, 건너뜀 ${skipped}편` : '');
      const text = `ArxivJS: ${cancelled ? '일괄 요약을 취소했습니다. ' : ''}${summary}.${failed ? ' 실패 이유는 출력 채널 ArxivJS에 있습니다.' : ''}`;
      void (failed ? vscode.window.showWarningMessage(text) : vscode.window.showInformationMessage(text));
    }),
  ];
}
