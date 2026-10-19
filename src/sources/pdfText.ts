// PDF → 텍스트 (DEV-PLAN §8.3). vscode 비의존.
// unpdf(최신 pdf.js 내장)를 쓴다. 확장은 이 함수를 작업자(pdfWorker.ts → dist/pdfWorker.js)에서 실행한다.

/** PDF 바이트에서 페이지 텍스트를 모두 뽑아 이어 붙인다. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  // unpdf의 pdf.js 빌드에는 글꼴 eval 경로(new Function)가 없다. 옛 pdf.js의 CVE-2024-4367에 해당하지 않는다.
  const pdf = await getDocumentProxy(data);
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } finally {
    // unpdf가 내장한 pdf.js 빌드에서는 문서 객체가 아니라 loadingTask가 destroy를 가진다.
    await pdf.loadingTask.destroy();
  }
}
