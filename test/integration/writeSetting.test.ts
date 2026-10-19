// 쓰기 설정(arxivjs.enableWrite)의 화면과 가드 (DEV-PLAN §7.1).
// 이 스위트는 데이터 폴더에 쓰지 않는다. run-integration.mjs가 fixture가 그대로인지 검증한다.
import * as assert from 'node:assert';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';
import type { PaperNode, TopicNode } from '../../src/views/topicTreeProvider';

const EXTENSION_ID = 'doosik71.arxivjs-viewer';

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

const hasCreateButton = (html: string | undefined) => /data-action="createTopic"/.test(html ?? '');

suite('쓰기 설정', () => {
  let api: ArxivjsApi;
  let fixture = '';

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<ArxivjsApi>(EXTENSION_ID)!;
    api = await ext.activate();
    fixture = path.join(ext.extensionPath, 'test', 'fixtures', 'sample-data');
  });

  setup(async () => {
    await setConfig('dataFolder', fixture);
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await setConfig('enableWrite', undefined);
    await setConfig('dataFolder', undefined);
  });

  test('기본값은 꺼짐', () => {
    assert.strictEqual(vscode.workspace.getConfiguration('arxivjs').get('enableWrite'), false);
  });

  test('쓰기 명령이 등록되어 있다', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'arxivjs.createTopic',
      'arxivjs.renameTopic',
      'arxivjs.deleteTopic',
      'arxivjs.addPaper',
      'arxivjs.editPaperMeta',
      'arxivjs.movePaper',
      'arxivjs.deletePaper',
      'arxivjs.deleteSummary',
      'arxivjs.summarizePaper',
      'arxivjs.summarizeTopic',
      'arxivjs.setGeminiApiKey',
      'arxivjs.clearGeminiApiKey',
    ]) {
      assert.ok(commands.includes(id), id);
    }
  });

  test('홈의 "주제 추가" 버튼은 쓰기가 켜져 있을 때만 보인다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    assert.strictEqual(hasCreateButton(api.home.html), false);

    await setConfig('enableWrite', true);
    await waitFor(() => hasCreateButton(api.home.html), '쓰기를 켠 뒤 버튼이 나타나지 않았다');

    await setConfig('enableWrite', false);
    await waitFor(() => !hasCreateButton(api.home.html), '쓰기를 끈 뒤 버튼이 사라지지 않았다');
  });

  test('Topic 패널의 "논문 추가" 버튼은 쓰기가 켜져 있을 때만 보인다', async () => {
    const node = ((await api.tree.getChildren()) as TopicNode[]).find((n) => n.topic.id === 'Cosine_Similarity')!;
    await vscode.commands.executeCommand('arxivjs.openTopic', node);
    const has = () => /data-action="addPaper"/.test(api.topicPanel.html ?? '');
    assert.strictEqual(has(), false);
    await setConfig('enableWrite', true);
    await waitFor(has, '쓰기를 켠 뒤 버튼이 나타나지 않았다');
    await setConfig('enableWrite', false);
    await waitFor(() => !has(), '쓰기를 끈 뒤 버튼이 사라지지 않았다');
  });

  test('Paper 패널의 "메타 편집"·"요약 삭제" 버튼은 쓰기가 켜져 있을 때만 보인다', async () => {
    const topicNode = ((await api.tree.getChildren()) as TopicNode[]).find((n) => n.topic.id === 'Cosine_Similarity')!;
    const paperNode = ((await api.tree.getChildren(topicNode)) as PaperNode[]).find((n) => n.paper.mdPath)!;
    await vscode.commands.executeCommand('arxivjs.openPaper', paperNode);
    const html = () => api.panels.htmlOf(paperNode.paper.id) ?? '';
    assert.doesNotMatch(html(), /data-action="editMeta"/);
    await setConfig('enableWrite', true);
    await waitFor(() => /data-action="editMeta"/.test(html()) && /data-action="deleteSummary"/.test(html()), '쓰기를 켠 뒤 버튼이 나타나지 않았다');
    assert.match(html(), /data-action="summarize"[^>]*>요약 다시 생성</);
    await setConfig('enableWrite', false);
    await waitFor(() => !/data-action="editMeta"/.test(html()), '쓰기를 끈 뒤 버튼이 사라지지 않았다');
  });

  test('PDF 추출 작업자(dist/pdfWorker.js)가 확장 호스트에서 동작하고 전역을 건드리지 않는다', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const extract = (data: Uint8Array) =>
      new Promise<{ text?: string; error?: string }>((resolve, reject) => {
        const worker = new Worker(path.join(ext.extensionPath, 'dist', 'pdfWorker.js'));
        worker.once('message', (msg) => {
          void worker.terminate();
          resolve(msg);
        });
        worker.once('error', reject);
        worker.postMessage(data);
      });
    const content = 'BT /F1 24 Tf 72 720 Td (Hello ArxivJS) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    // 최소 PDF: 객체마다 바이트 오프셋을 기록해 xref 표를 만든다.
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((obj, i) => {
      const at = pdf.length;
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
      return at;
    });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const result = await extract(new TextEncoder().encode(pdf));
    assert.strictEqual(result.error, undefined);
    assert.match(result.text ?? '', /Hello ArxivJS/);
    assert.deepStrictEqual(Object.getOwnPropertyDescriptor(globalThis, 'navigator'), navigatorBefore);
    assert.deepStrictEqual(await extract(new TextEncoder().encode('not a pdf')).then((r) => typeof r.error), 'string');
  });

  test('쓰기가 꺼져 있으면 명령을 실행해도 Library의 writer가 거부한다', async () => {
    const library = api.getLibrary()!;
    await assert.rejects(library.writer.makeDirectory(path.join(fixture, 'Should_Not_Exist')), { kind: 'writeDisabled' });
    const node = ((await api.tree.getChildren()) as TopicNode[]).find((n) => n.topic.id === 'Autoencoder');
    assert.ok(node);
    await vscode.commands.executeCommand('arxivjs.deleteTopic', node); // 안내만 하고 아무것도 하지 않는다.
    assert.ok((await library.topics.list()).some((t) => t.id === 'Autoencoder'));
    const [paperNode] = (await api.tree.getChildren(node)) as PaperNode[];
    await vscode.commands.executeCommand('arxivjs.deletePaper', paperNode);
    await vscode.commands.executeCommand('arxivjs.deleteSummary', paperNode);
    library.papers.reloadTopic('Autoencoder');
    assert.strictEqual((await library.papers.list(node.topic)).length, 1);
  });
});

async function waitFor(condition: () => boolean, message: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(message);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}
