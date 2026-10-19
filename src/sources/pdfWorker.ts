// PDF 텍스트 추출 작업자 (worker_threads). esbuild가 dist/pdfWorker.js로 따로 번들한다.
// pdf.js(unpdf)는 navigator, DOMMatrix 같은 전역을 고친다. 확장 호스트의 전역은 다른 확장과 함께 쓰고
// navigator는 읽기 전용이라, 별도 작업자에서 실행한다. PDF 해석이 확장 호스트를 막지도 않는다.
// 프로토콜: Uint8Array 하나를 받아 { text } 또는 { error }를 한 번 보낸다.
import { parentPort } from 'node:worker_threads';
import { extractPdfText } from './pdfText';

parentPort?.once('message', async (data: Uint8Array) => {
  try {
    parentPort?.postMessage({ text: await extractPdfText(data) });
  } catch (err) {
    parentPort?.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
});
