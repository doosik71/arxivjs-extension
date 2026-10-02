import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ArxivjsApi } from '../../src/extension';
import type { PaperNode, TopicNode, TreeNode } from '../../src/views/topicTreeProvider';

const EXTENSION_ID = 'doosik71.arxivjs-viewer';
let FIXTURE = '';

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

const label = (item: vscode.TreeItem) => (typeof item.label === 'string' ? item.label : item.label?.label);

suite('Topics 트리', () => {
  let api: ArxivjsApi;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<ArxivjsApi>(EXTENSION_ID);
    assert.ok(ext);
    api = await ext.activate();
    FIXTURE = path.join(ext.extensionPath, 'test', 'fixtures', 'sample-data');
  });

  teardown(async () => {
    await setConfig('dataFolder', undefined);
    await setConfig('paperSort', undefined);
  });

  async function topics(): Promise<TopicNode[]> {
    return (await api.tree.getChildren()) as TopicNode[];
  }

  async function papersOf(topicId: string): Promise<PaperNode[]> {
    const node = (await topics()).find((t) => t.topic.id === topicId);
    assert.ok(node, `주제 없음: ${topicId}`);
    return (await api.tree.getChildren(node)) as PaperNode[];
  }

  test('데이터 폴더가 없으면 빈 트리와 noFolder 상태', async () => {
    await setConfig('dataFolder', '');
    assert.deepStrictEqual(await api.tree.getChildren(), []);
    assert.strictEqual(api.tree.state, 'noFolder');
  });

  test('없는 경로, 상대 경로는 invalidFolder 상태', async () => {
    await setConfig('dataFolder', path.join(FIXTURE, 'no_such_dir'));
    assert.deepStrictEqual(await api.tree.getChildren(), []);
    assert.strictEqual(api.tree.state, 'invalidFolder');

    await setConfig('dataFolder', 'relative/path');
    assert.deepStrictEqual(await api.tree.getChildren(), []);
    assert.strictEqual(api.tree.state, 'invalidFolder');
  });

  test('주제 목록: 규칙에 맞는 폴더만, 표시 이름으로', async () => {
    await setConfig('dataFolder', FIXTURE);
    const nodes = await topics();
    assert.strictEqual(api.tree.state, 'ready');
    assert.deepStrictEqual(
      nodes.map((n) => label(api.tree.getTreeItem(n))),
      [
        'Agentic Reasoning',
        'Alzheimer Detection',
        'Autoencoder',
        'Broken Data',
        'Cosine Similarity',
        'Few-Shot Learning',
        'Large Language Model',
        'Surgical Instrument Segmentation',
      ],
    );
    const item = api.tree.getTreeItem(nodes[0]);
    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(item.contextValue, 'arxivjs.topic');
    assert.strictEqual(item.description, undefined, '펼치기 전에는 논문 수를 모른다');
  });

  test('주제를 펼치면 논문 목록과 "연도 · 인용수", 이후 주제에 "(N)"', async () => {
    await setConfig('dataFolder', FIXTURE);
    const papers = await papersOf('Few-Shot_Learning');
    const items = papers.map((p) => api.tree.getTreeItem(p));

    assert.deepStrictEqual(
      items.map((i) => i.description),
      ['2019 · 11', '2016 · 11', '2019 · 1 · 문서 없음'],
    );
    assert.strictEqual(items[0].collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.strictEqual(items[2].contextValue, 'arxivjs.paper.noMarkdown');

    const topicNode = api.tree.getTopicNode('Few-Shot_Learning')!;
    assert.strictEqual(api.tree.getTreeItem(topicNode).description, '(3)');
    assert.strictEqual(api.tree.getParent(papers[0]), topicNode);
  });

  test('툴팁: 메타 정보와 초록, 데이터는 이스케이프', async () => {
    await setConfig('dataFolder', FIXTURE);
    const [paper] = await papersOf('Large_Language_Model');
    const item = api.tree.resolveTreeItem(api.tree.getTreeItem(paper), paper) as vscode.TreeItem;
    const tooltip = item.tooltip as vscode.MarkdownString;
    assert.ok(tooltip instanceof vscode.MarkdownString);
    assert.ok(tooltip.value.includes('monitor'));
    assert.ok(!tooltip.value.includes('<think>'), `HTML처럼 보이는 텍스트가 이스케이프되어야 한다: ${tooltip.value.slice(0, 120)}`);
    assert.ok(!tooltip.isTrusted);
  });

  test('깨진 json 논문은 경고 아이콘', async () => {
    await setConfig('dataFolder', FIXTURE);
    const papers = await papersOf('Broken_Data');
    const broken = papers.find((p) => p.paper.stem === 'broken_json_paper')!;
    const icon = api.tree.getTreeItem(broken).iconPath as vscode.ThemeIcon;
    assert.strictEqual(icon.id, 'warning');
  });

  test('정렬 설정을 바꾸면 다시 읽지 않고 순서만 바뀐다', async () => {
    await setConfig('dataFolder', FIXTURE);
    await papersOf('Few-Shot_Learning');
    const library = api.getLibrary()!;
    await setConfig('paperSort', 'title');
    assert.strictEqual(api.getLibrary(), library, '정렬만 바뀌면 Library를 새로 만들지 않는다');
    assert.ok(library.papers.isLoaded('Few-Shot_Learning'), '정렬만 바뀌면 캐시를 유지한다');
    const titles = (await papersOf('Few-Shot_Learning')).map((p) => p.paper.meta.title);
    assert.deepStrictEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  });

  test('Reload 명령: 전체와 주제', async () => {
    await setConfig('dataFolder', FIXTURE);
    await papersOf('Cosine_Similarity');
    const library = api.getLibrary()!;
    assert.ok(library.papers.isLoaded('Cosine_Similarity'));

    const topicNode = api.tree.getTopicNode('Cosine_Similarity');
    await vscode.commands.executeCommand('arxivjs.reloadTopic', topicNode);
    assert.strictEqual(library.papers.isLoaded('Cosine_Similarity'), false);
    assert.strictEqual(api.tree.getTreeItem(topicNode!).description, undefined);

    await papersOf('Cosine_Similarity');
    await vscode.commands.executeCommand('arxivjs.reload');
    assert.strictEqual(library.papers.isLoaded('Cosine_Similarity'), false);
    assert.strictEqual((await topics()).length, 8);
  });

  test('주제 폴더가 없으면 오류 메시지 노드', async () => {
    await setConfig('dataFolder', FIXTURE);
    const fake: TreeNode = { kind: 'topic', topic: { id: 'Gone', label: 'Gone', path: path.join(FIXTURE, 'Gone') } };
    const [message] = await api.tree.getChildren(fake);
    assert.strictEqual(message.kind, 'message');
    assert.match(label(api.tree.getTreeItem(message)) ?? '', /Reload/);
  });
});
