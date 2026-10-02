import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';
import type { PaperNode, TopicNode } from '../../src/views/topicTreeProvider';

const EXTENSION_ID = 'doosik71.arxivjs-viewer';

async function waitFor(condition: () => boolean, message: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(message);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

suite('Paper 패널', () => {
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
    await setConfig('openInNewTab', undefined);
    await setConfig('dataFolder', undefined);
  });

  async function paperNode(topicId: string, stem?: string): Promise<PaperNode> {
    const topic = ((await api.tree.getChildren()) as TopicNode[]).find((t) => t.topic.id === topicId)!;
    const papers = (await api.tree.getChildren(topic)) as PaperNode[];
    const node = stem ? papers.find((p) => p.paper.stem === stem) : papers[0];
    assert.ok(node, `논문 없음: ${topicId}/${stem}`);
    return node;
  }

  async function open(node: PaperNode): Promise<string> {
    await vscode.commands.executeCommand('arxivjs.openPaper', node);
    const html = api.panels.htmlOf(node.paper.id);
    assert.ok(html, '패널 HTML이 없다');
    return html;
  }

  test('트리의 논문 노드를 누르면 openPaper 명령이 실행된다', async () => {
    const node = await paperNode('Cosine_Similarity');
    const item = api.tree.getTreeItem(node);
    assert.strictEqual(item.command?.command, 'arxivjs.openPaper');
    assert.deepStrictEqual(item.command?.arguments, [node]);
  });

  test('메타 헤더, 수식, 목차, CSP', async () => {
    const html = await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    assert.match(html, /<h1 class="paper-title">A Closer Look at Few-shot Classification<\/h1>/);
    assert.match(html, /인용 2,737/);
    assert.match(html, /class="katex"/);
    assert.match(html, /class="toc"/);
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /<script nonce="[^"]+" src="[^"]+paper\.js"><\/script>/);
    assert.ok(!/<h1 id=/.test(html), '문서 본문의 H1은 메타 헤더와 겹치므로 지운다');
    assert.ok(!/<p>Wei-Yu Chen/.test(html), '문서의 저자 줄도 지운다');
  });

  test('<think> 텍스트는 이스케이프된다', async () => {
    const html = await open(await paperNode('Large_Language_Model'));
    assert.match(html, /&lt;think&gt;/);
    assert.ok(!/<think>/.test(html));
  });

  test('원격 이미지와 source 배지', async () => {
    const html = await open(await paperNode('Alzheimer_Detection'));
    assert.match(html, /<img src="https:\/\/www\.mdpi\.com\//);
    assert.match(html, /class="badge source-pdf">pdf<\/span>/);
  });

  test('md가 없으면 안내와 펼친 초록', async () => {
    const html = await open(await paperNode('Few-Shot_Learning', 'domain_agnostic_few_shot_classification_by_learning_disparate_modulators'));
    assert.match(html, /요약 문서\(\.md\)가 없습니다/);
    assert.match(html, /<details open><summary>초록/);
    assert.ok(!html.includes('markdown-body'));
  });

  test('깨진 json은 경고 안내와 md 본문', async () => {
    const html = await open(await paperNode('Broken_Data', 'broken_json_paper'));
    assert.match(html, /notice-warning/);
    assert.match(html, /markdown-body/);
  });

  test('"로컬 문서 열기": 실제 md 파일을 편집기로 연다 (md가 없는 논문에는 버튼이 없다)', async () => {
    const node = await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification');
    const html = await open(node);
    assert.match(html, /data-action="openExternal"[^]*data-action="openLocal"/, '원문 열기 오른쪽에 있어야 한다');

    await api.panels.handleMessage(node.paper.id, { type: 'openLocal' });
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.fsPath.toLowerCase() === node.paper.mdPath!.toLowerCase(),
      `md 파일이 열리지 않았다: ${vscode.window.activeTextEditor?.document.uri.fsPath}`,
    );
    const doc = vscode.window.activeTextEditor!.document;
    assert.strictEqual(doc.uri.scheme, 'file');
    assert.strictEqual(doc.isDirty, false, '열기만 하고 내용은 바꾸지 않는다');

    const noMd = await open(await paperNode('Few-Shot_Learning', 'domain_agnostic_few_shot_classification_by_learning_disparate_modulators'));
    assert.ok(!noMd.includes('data-action="openLocal"'));
  });

  test('기본(openInNewTab=true)은 논문마다 새 탭을 연다. 같은 논문은 기존 탭을 쓴다', async () => {
    await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    await open(await paperNode('Cosine_Similarity', 'low_shot_learning_with_imprinted_weights'));
    await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    assert.strictEqual(api.panels.openPaperIds.length, 2);
  });

  test('openInNewTab=false이면 탭 하나를 재사용한다', async () => {
    await setConfig('openInNewTab', false);
    await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    await open(await paperNode('Cosine_Similarity', 'low_shot_learning_with_imprinted_weights'));
    assert.deepStrictEqual(api.panels.openPaperIds, ['Cosine_Similarity/low_shot_learning_with_imprinted_weights']);
  });

  /** Topic 패널에서 논문 두 편을 열고, 편집기 그룹별 탭 이름을 돌려준다. */
  async function openTwoFromTopicPanel(): Promise<string[][]> {
    await vscode.commands.executeCommand('arxivjs.openTopic', api.tree.getTopicNode('Cosine_Similarity') ?? (await paperNode('Cosine_Similarity')).parent);
    for (const stem of ['a_closer_look_at_few_shot_classification', 'low_shot_learning_with_imprinted_weights']) {
      await api.topicPanel.handleMessage({ type: 'openPaper', id: `Cosine_Similarity/${stem}` });
      await waitFor(() => api.panels.openPaperIds.includes(`Cosine_Similarity/${stem}`), `논문이 열리지 않았다: ${stem}`);
    }
    const groups = () => vscode.window.tabGroups.all.map((g) => g.tabs.map((t) => t.label));
    await waitFor(() => groups().flat().length >= 3, `탭이 모두 보이지 않는다: ${JSON.stringify(groups())}`);
    return groups();
  }

  test('paperPanelLocation=sameGroup(기본): Topic 패널과 같은 편집기 그룹에 새 탭으로 연다', async () => {
    const groups = await openTwoFromTopicPanel();
    assert.strictEqual(groups.length, 1, `편집기 그룹이 나뉘면 안 된다: ${JSON.stringify(groups)}`);
    assert.strictEqual(groups[0].length, 3);
  });

  test('paperPanelLocation=beside: Topic 패널 옆 그룹에 연다 (클릭할 때마다 더 나뉘지는 않는다)', async () => {
    await setConfig('paperPanelLocation', 'beside');
    try {
      const groups = await openTwoFromTopicPanel();
      assert.strictEqual(groups.length, 2, `그룹: ${JSON.stringify(groups)}`);
      const topicGroup = groups.find((g) => g.includes('Cosine Similarity'))!;
      assert.deepStrictEqual(topicGroup, ['Cosine Similarity'], '논문은 Topic 패널과 다른 그룹에 있어야 한다');
    } finally {
      await setConfig('paperPanelLocation', undefined);
    }
  });

  test('Reload Paper 명령은 활성 패널을 다시 그린다', async () => {
    const node = await paperNode('Autoencoder');
    const before = await open(node);
    await vscode.commands.executeCommand('arxivjs.reloadPaper');
    const after = api.panels.htmlOf(node.paper.id)!;
    assert.notStrictEqual(after, before, 'nonce가 바뀌므로 HTML이 새로 만들어져야 한다');
    assert.match(after, /class="badge source-manual">manual<\/span>/);
  });

  test('데이터 폴더를 바꾸면 패널을 닫는다', async () => {
    await open(await paperNode('Cosine_Similarity'));
    await setConfig('dataFolder', path.join(fixture, 'Cosine_Similarity'));
    assert.deepStrictEqual(api.panels.openPaperIds, []);
  });
});
