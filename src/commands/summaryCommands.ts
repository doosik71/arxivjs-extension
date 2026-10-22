// AI 요약 명령 (DEV-PLAN §8): Gemini API 키 관리, 논문 요약, 주제 일괄 요약.
// 실제 작업은 src/llm/summarize.ts가 한다.
import * as vscode from 'vscode';
import type { Topic } from '../data/models';
import { t } from '../i18n';
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
  stage === 'text' ? t().summaryCmd.preparingText : t().summaryCmd.receiving(describeEngine(settings), chars ?? 0);

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
      const setKey = t().summaryCmd.setApiKey;
      const openSettings = t().common.openSettings;
      const action = settings.engine === 'gemini' && !settings.geminiApiKey ? setKey : openSettings;
      const choice = await vscode.window.showWarningMessage(`ArxivJS: ${problem}`, action);
      if (choice === setKey) {
        await vscode.commands.executeCommand('arxivjs.setGeminiApiKey');
      } else if (choice === openSettings) {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'arxivjs.llm');
      }
      return undefined;
    }
    return settings;
  };

  /** 사용자에게 보일 이유가 있는 오류(LLM, 전문 텍스트)는 그대로, 나머지는 공용 처리 */
  const reportSummaryError = (title: string, err: unknown) => {
    if (err instanceof LlmError || err instanceof FullTextError) {
      log.error(`Summary failed: ${title} — ${err.message}`);
      void vscode.window.showErrorMessage(`ArxivJS: ${t().summaryCmd.failed(err.message)}`);
    } else {
      reportError((msg) => msg.action.summarize, err);
    }
  };

  return [
    vscode.commands.registerCommand('arxivjs.setGeminiApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: t().summaryCmd.apiKeyTitle,
        prompt: t().summaryCmd.apiKeyPrompt,
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (/\s/.test(v.trim()) ? t().summaryCmd.apiKeyWhitespace : undefined),
      });
      if (!key?.trim()) {
        return;
      }
      await host.secrets.store(GEMINI_KEY_SECRET, key.trim());
      log.info('Saved the Gemini API key.'); // 키 값은 기록하지 않는다.
      void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.apiKeySaved}`);
    }),

    vscode.commands.registerCommand('arxivjs.clearGeminiApiKey', async () => {
      await host.secrets.delete(GEMINI_KEY_SECRET);
      log.info('Deleted the Gemini API key.');
      void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.apiKeyCleared}`);
    }),

    vscode.commands.registerCommand('arxivjs.summarizePaper', async (arg?: unknown) => {
      const library = writableLibrary();
      const target = library && resolveWritablePaper(arg);
      if (!library || !target) {
        return;
      }
      const { topic, paper } = target;
      if (running.has(paper.id)) {
        void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.alreadyRunning}`);
        return;
      }
      const settings = await readySettings();
      if (!settings) {
        return;
      }
      if (paper.mdPath) {
        const m = t().summaryCmd;
        const choice = await vscode.window.showWarningMessage(
          m.confirmRegenerate(ellipsize(paper.meta.title, 60)),
          { modal: true, detail: m.regenerateDetail },
          m.regenerate,
        );
        if (choice !== m.regenerate) {
          return;
        }
      }
      running.add(paper.id);
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: t().summaryCmd.progressTitle(ellipsize(paper.meta.title, 40)), cancellable: true },
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
              log.info(`Saved summary: ${paper.id} (${describeEngine(settings)}, ${result.chars} chars)`);
              await host.reloadPaper(target);
              void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.saved(result.chars)}`);
            } catch (err) {
              if (controller.signal.aborted) {
                log.info(`Summary cancelled: ${paper.id}`);
                void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.cancelled}`);
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
      const topic = library && (n?.kind === 'topic' ? n.topic : await host.pickTopic(t().summaryCmd.batchPick));
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
        void vscode.window.showInformationMessage(`ArxivJS: ${t().summaryCmd.noneMissing(topic.label)}`);
        return;
      }
      const m = t().summaryCmd;
      const choice = await vscode.window.showWarningMessage(
        m.confirmBatch(topic.label, papers.length),
        { modal: true, detail: m.batchDetail(describeEngine(settings), ARXIV_DELAY_MS / 1000) },
        m.summarize,
      );
      if (choice !== m.summarize) {
        return;
      }

      let ok = 0;
      let failed = 0;
      let skipped = 0;
      let cancelled = false;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: m.batchTitle(topic.label), cancellable: true },
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
              log.info(`Saved summary: ${paper.id} (${describeEngine(settings)}, ${result.chars} chars)`);
              await host.reloadPaper({ topic, paper: fresh });
              if (result.downloaded && i < papers.length - 1) {
                await delay(ARXIV_DELAY_MS);
              }
            } catch (err) {
              if (controller.signal.aborted) {
                break;
              }
              failed++;
              log.error(`Summary failed: ${paper.id} — ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              running.delete(paper.id);
            }
            progress.report({ increment: 100 / papers.length });
          }
          cancelled = controller.signal.aborted;
        },
      );
      host.reloadTopic(topic.id);
      const text = `ArxivJS: ${m.batchResult({ ok, failed, skipped, cancelled })}`;
      void (failed ? vscode.window.showWarningMessage(text) : vscode.window.showInformationMessage(text));
    }),
  ];
}
