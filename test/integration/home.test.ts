import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';

const EXTENSION_ID = 'doosik71.arxivjs-viewer';

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

function embeddedData(html: string | undefined): { folder: string; rows: { id: string; label: string; count?: number }[] } {
  const m = /<script id="home-data" type="application\/json">([^<]*)<\/script>/.exec(html ?? '');
  assert.ok(m, 'home-data 스크립트가 없다');
  return JSON.parse(m[1]);
}

const nonceOf = (html: string | undefined) => /nonce="([^"]+)"/.exec(html ?? '')?.[1];

async function waitFor(condition: () => boolean, message: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(message);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

suite('홈 (주제 목록)', () => {
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
    await setConfig('dataFolder', undefined);
  });

  test('첫 화면은 주제 목록만으로 그리고, 논문 수는 나중에 비동기로 센다', async () => {
    await vscode.commands.executeCommand('arxivjs.reload'); // 개수 캐시를 비워 처음 여는 상황을 만든다.
    await vscode.commands.executeCommand('arxivjs.openHome');
    const data = embeddedData(api.home.html);
    assert.strictEqual(data.folder, fixture);
    assert.strictEqual(data.rows.length, 8);
    assert.ok(
      data.rows.every((r) => r.count === undefined),
      '첫 화면 데이터에는 논문 수가 없어야 한다',
    );
    assert.match(api.home.html!, /주제 8개 · 논문 수 세는 중…/);

    await api.home.whenCountsReady();
    const counts = Object.fromEntries(api.home.paperCounts);
    assert.deepStrictEqual(counts, {
      Agentic_Reasoning: 1,
      Alzheimer_Detection: 1,
      Autoencoder: 1,
      Broken_Data: 2,
      Cosine_Similarity: 2,
      'Few-Shot_Learning': 3,
      Large_Language_Model: 1,
      Surgical_Instrument_Segmentation: 1,
    });
  });

  test('webview가 준비되면(ready) 지금까지 센 논문 수를 다시 보낸다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    await api.home.whenCountsReady();
    await api.home.handleMessage({ type: 'ready' }); // 예외 없이 처리되어야 한다.
    assert.strictEqual(api.home.paperCounts.size, 8);
  });

  test('Reload 후에는 이전 개수 세기 결과를 버리고 다시 센다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    await api.home.whenCountsReady();
    await api.home.handleMessage({ type: 'reload' });
    await waitFor(() => api.home.paperCounts.size === 0 || api.home.paperCounts.size === 8, '개수 상태가 이상하다');
    await api.home.whenCountsReady();
    assert.strictEqual(api.home.paperCounts.size, 8);
  });

  test('논문 수를 셀 때는 json을 읽지 않는다 (목록 캐시도 만들지 않는다)', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    assert.strictEqual(api.getLibrary()!.papers.isLoaded('Few-Shot_Learning'), false);
  });

  test('홈에서 주제를 누르면 Topic 패널이 열린다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    await api.home.handleMessage({ type: 'openTopic', id: 'Few-Shot_Learning' });
    await waitFor(() => api.topicPanel.currentTopicId === 'Few-Shot_Learning', 'Topic 패널이 열리지 않았다');
  });

  test('홈의 Reload는 전체를 다시 읽고 다시 그린다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    const before = api.home.html;
    await api.home.handleMessage({ type: 'reload' });
    await waitFor(() => nonceOf(api.home.html) !== nonceOf(before), '홈이 다시 그려지지 않았다');
  });

  test('데이터 폴더가 없으면 안내, 바꾸면 새 폴더로 다시 그린다', async () => {
    await setConfig('dataFolder', '');
    await vscode.commands.executeCommand('arxivjs.openHome');
    assert.match(api.home.html!, /데이터 폴더가 설정되지 않았습니다/);
    assert.strictEqual(embeddedData(api.home.html).rows.length, 0);

    await setConfig('dataFolder', fixture);
    await waitFor(() => embeddedData(api.home.html).rows.length === 8, '데이터 폴더를 바꾼 뒤 홈이 다시 그려지지 않았다');
    assert.ok(api.home.isOpen, '데이터 폴더를 바꿔도 홈은 닫지 않는다');
  });

  test('홈은 패널 하나를 재사용한다', async () => {
    await vscode.commands.executeCommand('arxivjs.openHome');
    await vscode.commands.executeCommand('arxivjs.openHome');
    const tabLabels = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).map((t) => t.label);
    await waitFor(() => tabLabels().includes('ArxivJS'), '홈 탭이 보이지 않는다');
    assert.strictEqual(tabLabels().filter((l) => l === 'ArxivJS').length, 1);
  });
});
