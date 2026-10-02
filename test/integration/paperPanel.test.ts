import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';
import type { PaperNode, TopicNode } from '../../src/views/topicTreeProvider';

const EXTENSION_ID = 'arxivjs.arxivjs-viewer';

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

  test('기본은 패널 하나를 재사용한다', async () => {
    await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    await open(await paperNode('Cosine_Similarity', 'low_shot_learning_with_imprinted_weights'));
    assert.deepStrictEqual(api.panels.openPaperIds, ['Cosine_Similarity/low_shot_learning_with_imprinted_weights']);
  });

  test('openInNewTab이면 논문마다 패널을 연다', async () => {
    await setConfig('openInNewTab', true);
    await open(await paperNode('Cosine_Similarity', 'a_closer_look_at_few_shot_classification'));
    await open(await paperNode('Cosine_Similarity', 'low_shot_learning_with_imprinted_weights'));
    assert.strictEqual(api.panels.openPaperIds.length, 2);
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
