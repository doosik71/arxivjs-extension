import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';
import type { TopicNode } from '../../src/views/topicTreeProvider';

const EXTENSION_ID = 'arxivjs.arxivjs-viewer';

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

/** HTML 안의 topic-data JSON */
function embeddedData(html: string): { topicId: string; defaultSort: string; rows: { id: string; title: string; hasMarkdown: boolean }[] } {
  const m = /<script id="topic-data" type="application\/json">([^<]*)<\/script>/.exec(html);
  assert.ok(m, 'topic-data 스크립트가 없다');
  return JSON.parse(m[1]);
}

const nonceOf = (html: string | undefined) => /nonce="([^"]+)"/.exec(html ?? '')?.[1];

suite('Topic 패널', () => {
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
    await setConfig('paperSort', undefined);
    await setConfig('dataFolder', undefined);
  });

  async function topicNode(id: string): Promise<TopicNode> {
    const node = ((await api.tree.getChildren()) as TopicNode[]).find((t) => t.topic.id === id);
    assert.ok(node, `주제 없음: ${id}`);
    return node;
  }

  async function openTopic(id: string): Promise<string> {
    await vscode.commands.executeCommand('arxivjs.openTopic', await topicNode(id));
    assert.strictEqual(api.topicPanel.currentTopicId, id);
    return api.topicPanel.html!;
  }

  test('트리의 주제 노드를 누르면 openTopic 명령이 실행된다', async () => {
    const node = await topicNode('Few-Shot_Learning');
    const item = api.tree.getTreeItem(node);
    assert.strictEqual(item.command?.command, 'arxivjs.openTopic');
    assert.deepStrictEqual(item.command?.arguments, [node]);
  });

  test('논문 표 데이터: 주제의 모든 논문, 설정의 정렬 기준', async () => {
    await setConfig('paperSort', 'year');
    const data = embeddedData(await openTopic('Few-Shot_Learning'));
    assert.strictEqual(data.topicId, 'Few-Shot_Learning');
    assert.strictEqual(data.defaultSort, 'year');
    assert.strictEqual(data.rows.length, 3);
    assert.deepStrictEqual(
      data.rows.filter((r) => !r.hasMarkdown).map((r) => r.id),
      ['Few-Shot_Learning/domain_agnostic_few_shot_classification_by_learning_disparate_modulators'],
    );
  });

  test('HTML처럼 보이는 제목도 JSON 안에서 태그가 되지 않는다', async () => {
    const html = await openTopic('Large_Language_Model');
    const [row] = embeddedData(html).rows;
    assert.match(row.title, /<think>/, '데이터에는 원래 제목이 그대로 있다');
    const dataScript = /<script id="topic-data"[^>]*>([^<]*)<\/script>/.exec(html)![1];
    assert.ok(!dataScript.includes('<'), 'JSON 안에는 < 문자가 없어야 한다');
  });

  test('Topic 패널은 하나를 재사용한다', async () => {
    await openTopic('Few-Shot_Learning');
    await openTopic('Cosine_Similarity');
    const tabLabels = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).map((t) => t.label);
    await waitFor(() => tabLabels().includes('Cosine Similarity'), `탭이 보이지 않는다: ${tabLabels().join(', ')}`);
    const labels = tabLabels();
    assert.ok(!labels.includes('Few-Shot Learning'), '이전 주제의 패널이 남아 있으면 안 된다');
    assert.strictEqual(embeddedData(api.topicPanel.html!).topicId, 'Cosine_Similarity');
  });

  test('표에서 논문을 누르면 Paper 패널이 열린다', async () => {
    const data = embeddedData(await openTopic('Cosine_Similarity'));
    await api.topicPanel.handleMessage({ type: 'openPaper', id: data.rows[0].id });
    await waitFor(() => api.panels.openPaperIds.includes(data.rows[0].id), 'Paper 패널이 열리지 않았다');
  });

  test('Topic 패널 Reload: 캐시를 비우고 다시 그린다', async () => {
    const before = await openTopic('Cosine_Similarity');
    const library = api.getLibrary()!;
    await api.topicPanel.handleMessage({ type: 'reload' });
    await waitFor(() => nonceOf(api.topicPanel.html) !== nonceOf(before), 'Topic 패널이 다시 그려지지 않았다');
    assert.ok(library.papers.isLoaded('Cosine_Similarity'), '다시 읽은 목록이 캐시에 있어야 한다');
    assert.strictEqual(embeddedData(api.topicPanel.html!).rows.length, 2);
  });

  test('트리의 전체 Reload, 주제 Reload도 열린 Topic 패널을 다시 그린다', async () => {
    let html = await openTopic('Cosine_Similarity');
    await vscode.commands.executeCommand('arxivjs.reload');
    await waitFor(() => nonceOf(api.topicPanel.html) !== nonceOf(html), '전체 Reload 후 다시 그려지지 않았다');

    html = api.topicPanel.html!;
    await vscode.commands.executeCommand('arxivjs.reloadTopic', await topicNode('Few-Shot_Learning'));
    assert.strictEqual(nonceOf(api.topicPanel.html), nonceOf(html), '다른 주제의 Reload는 영향이 없다');

    await vscode.commands.executeCommand('arxivjs.reloadTopic', await topicNode('Cosine_Similarity'));
    await waitFor(() => nonceOf(api.topicPanel.html) !== nonceOf(html), '주제 Reload 후 다시 그려지지 않았다');
  });

  test('주제 폴더가 없으면 안내', async () => {
    await api.topicPanel.show({ id: 'Gone', label: 'Gone', path: path.join(fixture, 'Gone') });
    assert.match(api.topicPanel.html!, /notice-error/);
    assert.strictEqual(embeddedData(api.topicPanel.html!).rows.length, 0);
  });

  test('데이터 폴더를 바꾸면 Topic 패널을 닫는다', async () => {
    await openTopic('Cosine_Similarity');
    await setConfig('dataFolder', path.join(fixture, 'Cosine_Similarity'));
    assert.strictEqual(api.topicPanel.currentTopicId, undefined);
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
