// dist/pdfWorker.js를 PDF 추출기로 쓴다 (작업자는 추출 한 번마다 만들고 끝나면 종료한다). vscode 비의존.
import { Worker } from 'node:worker_threads';
import type { PdfTextExtractor } from './fullText';

export function createPdfWorkerExtractor(workerPath: string): PdfTextExtractor {
  return (data) =>
    new Promise<string>((resolve, reject) => {
      const worker = new Worker(workerPath);
      worker.once('message', (msg: { text?: string; error?: string }) => {
        void worker.terminate();
        if (msg.error !== undefined) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.text ?? '');
        }
      });
      worker.once('error', (err) => {
        void worker.terminate();
        reject(err);
      });
      // 결과를 보낸 뒤의 종료라면 이미 끝난 Promise라서 아무 일도 없다.
      worker.once('exit', (code) => reject(new Error(`the PDF extraction worker exited without a response (exit ${code})`)));
      worker.postMessage(data);
    });
}
