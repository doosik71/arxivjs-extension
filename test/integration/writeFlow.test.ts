// 쓰기 기능 전체 흐름 (DEV-PLAN §7.2): fixture의 임시 복사본을 데이터 폴더로 지정하고 실제 명령을 실행한다.
// 입력 창·QuickPick·확인 대화상자는 vscode.window 함수를 바꿔 끼워 미리 정한 답을 돌려준다.
// 네트워크(arXiv, PDF, Ollama)는 전역 fetch를 바꿔 끼워 가짜 응답을 돌려준다. 원본 fixture에는 쓰지 않는다.
import * as assert from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Paper, Topic } from '../../src/data/models';
import type { ArxivjsApi } from '../../src/extension';
import { copyFixture, type TempData } from './tempData';

const EXTENSION_ID = 'doosik71.arxivjs-viewer';

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('arxivjs').update(key, value, vscode.ConfigurationTarget.Global);
}

// ---- UI 대역 ----
type Item = vscode.QuickPickItem & Record<string, unknown>;
const ui = {
  /** showInputBox가 차례로 돌려줄 값 */
  inputs: [] as string[],
  /** showQuickPick이 차례로 고를 항목 */
  picks: [] as ((items: Item[]) => Item | Item[] | undefined)[],
  /** 모달 확인 대화상자가 차례로 누를 버튼 */
  confirms: [] as (string | undefined)[],
  /** 표시된 알림 (오류는 "ERROR "로 시작) */
  messages: [] as string[],
};
type WindowFns = Pick<typeof vscode.window, 'showInputBox' | 'showQuickPick' | 'showWarningMessage' | 'showInformationMessage' | 'showErrorMessage'>;
let originalWindow: WindowFns | undefined;

function stubWindow(): void {
  const w = vscode.window as unknown as Record<string, unknown>;
  originalWindow = {
    showInputBox: vscode.window.showInputBox,
    showQuickPick: vscode.window.showQuickPick,
    showWarningMessage: vscode.window.showWarningMessage,
    showInformationMessage: vscode.window.showInformationMessage,
    showErrorMessage: vscode.window.showErrorMessage,
  };
  w.showInputBox = async (options?: vscode.InputBoxOptions) => {
    const value = ui.inputs.shift();
    assert.ok(value !== undefined, `예상하지 못한 입력 창: ${options?.title}`);
    const check = await options?.validateInput?.(value);
    const severity = typeof check === 'object' && check ? check.severity : undefined;
    assert.ok(!check || severity === vscode.InputBoxValidationSeverity.Info, `입력 검사 실패: ${JSON.stringify(check)}`);
    return value;
  };
  w.showQuickPick = async (items: Item[] | Thenable<Item[]>, options?: vscode.QuickPickOptions) => {
    const pick = ui.picks.shift();
    assert.ok(pick, `예상하지 못한 QuickPick: ${options?.title}`);
    return pick(await items);
  };
  const record = (prefix: string) => async (message: string, ...rest: unknown[]) => {
    ui.messages.push(prefix + message);
    const modal = typeof rest[0] === 'object' && rest[0] !== null && (rest[0] as vscode.MessageOptions).modal;
    return modal ? ui.confirms.shift() : undefined;
  };
  w.showWarningMessage = record('');
  w.showInformationMessage = record('');
  w.showErrorMessage = record('ERROR ');
}

function restoreWindow(): void {
  if (originalWindow) {
    Object.assign(vscode.window as unknown as Record<string, unknown>, originalWindow);
  }
}

// ---- 네트워크 대역 ----
const ARXIV_FEED = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>http://arxiv.org/abs/1904.04232v2</id><published>2019-04-08T17:59:55Z</published>
  <title>A Closer Look at Few-shot Classification</title><summary>Few-shot classification aims to ...</summary>
  <author><name>Wei-Yu Chen</name></author><author><name>Yen-Cheng Liu</name></author>
</entry></feed>`;
const SUMMARY = '# A Closer Look at Few-shot Classification\n\nWei-Yu Chen, Yen-Cheng Liu\n\n## 🧩 Problem to Solve\n\n- 가짜 요약 $x^2$';

/** 텍스트 한 줄이 든 최소 PDF */
function tinyPdf(text: string): Uint8Array {
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const requests: { url: string; body?: string }[] = [];
let originalFetch: typeof fetch | undefined;

function stubFetch(): void {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.startsWith('https://export.arxiv.org/api/query')) {
      return new Response(ARXIV_FEED);
    }
    if (url === 'http://arxiv.org/pdf/1904.04232v2') {
      return new Response(tinyPdf('Few-shot full text'), { headers: { 'content-type': 'application/pdf' } });
    }
    if (url === 'http://ollama.test/api/generate') {
      const lines = [SUMMARY.slice(0, 20), SUMMARY.slice(20)].map((response) => JSON.stringify({ response }));
      return new Response(`${lines.join('\n')}\n${JSON.stringify({ response: '', done: true })}\n`);
    }
    return new Response('not found', { status: 404 });
  };
}

suite('쓰기 흐름 (임시 복사본)', () => {
  let api: ArxivjsApi;
  let data: TempData;
  const RL = '강화_학습_(RL)';
  const RL_RENAMED = 'Reinforcement_Learning';
  const ARXIV_STEM = 'a_closer_look_at_few_shot_classification';

  const at = (...parts: string[]) => path.join(data.root, ...parts);
  const files = (topicId: string, stem: string) =>
    readdirSync(at(topicId))
      .filter((n) => n.startsWith(`${stem}.`))
      .sort();
  const topic = async (id: string): Promise<Topic> => {
    const t = await api.getLibrary()!.topics.get(id);
    assert.ok(t, `주제 없음: ${id}`);
    return t;
  };
  const paper = async (topicId: string, stem: string): Promise<Paper> => {
    const lib = api.getLibrary()!;
    lib.papers.reloadTopic(topicId);
    const p = (await lib.papers.list(await topic(topicId))).find((x) => x.stem === stem);
    assert.ok(p, `논문 없음: ${topicId}/${stem}`);
    return p;
  };
  const target = async (topicId: string, stem: string) => ({ topic: await topic(topicId), paper: await paper(topicId, stem) });

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<ArxivjsApi>(EXTENSION_ID)!;
    api = await ext.activate();
    data = copyFixture(path.join(ext.extensionPath, 'test', 'fixtures', 'sample-data'));
    data.put('userprompt.txt', 'Summarize this paper.\n\n{context}');
    await setConfig('dataFolder', data.root);
    await setConfig('enableWrite', true);
    await setConfig('llm.engine', 'ollama');
    await setConfig('ollama.url', 'http://ollama.test');
    await setConfig('ollama.model', 'test-model');
    stubWindow();
    stubFetch();
  });

  setup(() => {
    ui.messages.length = 0;
  });

  teardown(() => {
    assert.deepStrictEqual([ui.inputs, ui.picks, ui.confirms].map((q) => q.length), [0, 0, 0], '쓰이지 않은 UI 답이 남았다');
    assert.deepStrictEqual(
      ui.messages.filter((m) => m.startsWith('ERROR ')),
      [],
    );
  });

  suiteTeardown(async () => {
    restoreWindow();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    for (const key of ['dataFolder', 'enableWrite', 'llm.engine', 'ollama.url', 'ollama.model']) {
      await setConfig(key, undefined);
    }
    data.cleanup();
  });

  test('주제 추가: 표시 이름을 폴더 이름으로 바꿔 만든다', async () => {
    ui.inputs.push('강화 학습 (RL)');
    await vscode.commands.executeCommand('arxivjs.createTopic');
    assert.ok(existsSync(at(RL)));
    assert.strictEqual((await topic(RL)).label, '강화 학습 (RL)');
  });

  test('arXiv ID로 논문 추가', async () => {
    ui.picks.push((items) => items.find((i) => i.id === 'id'));
    ui.inputs.push('https://arxiv.org/abs/1904.04232');
    await vscode.commands.executeCommand('arxivjs.addPaper', { kind: 'topic', topic: await topic(RL) });
    assert.ok(requests.some((r) => r.url.includes('id_list=1904.04232')));
    const json = JSON.parse(readFileSync(at(RL, `${ARXIV_STEM}.json`), 'utf8'));
    assert.deepStrictEqual(json, {
      title: 'A Closer Look at Few-shot Classification',
      authors: 'Wei-Yu Chen, Yen-Cheng Liu',
      year: 2019,
      url: 'http://arxiv.org/abs/1904.04232v2',
      abstract: 'Few-shot classification aims to ...',
      source: 'arxiv',
    });
    assert.ok(api.panels.openPaperIds.includes(`${RL}/${ARXIV_STEM}`), '추가한 논문을 연다');
  });

  test('같은 논문을 다시 추가하면 묻고, 기본(건너뛰기)이면 그대로 둔다', async () => {
    const before = readFileSync(at(RL, `${ARXIV_STEM}.json`), 'utf8');
    ui.picks.push((items) => items.find((i) => i.id === 'id'));
    ui.inputs.push('1904.04232');
    ui.confirms.push('Skip');
    await vscode.commands.executeCommand('arxivjs.addPaper', { kind: 'topic', topic: await topic(RL) });
    assert.strictEqual(readFileSync(at(RL, `${ARXIV_STEM}.json`), 'utf8'), before);
    assert.ok(ui.messages.some((m) => m.includes('skipped 1')));
  });

  test('직접 입력으로 논문 추가 (메타 정보 폼)', async () => {
    ui.picks.push((items) => items.find((i) => i.id === 'manual'));
    await vscode.commands.executeCommand('arxivjs.addPaper', { kind: 'topic', topic: await topic('Autoencoder') });
    assert.match(api.metaEditor.html ?? '', /Add Paper — Autoencoder/);
    const values = { title: '수동 입력 논문', authors: 'Kim, Lee', year: '2025', url: '', abstract: '', citation: '', source: 'manual', paperId: 'manual_paper' };
    await api.metaEditor.handleMessage({ type: 'submit', values: { ...values, year: '25' } }); // 검사 실패 → 저장 안 함
    assert.strictEqual(existsSync(at('Autoencoder', 'manual_paper.json')), false);
    await api.metaEditor.handleMessage({ type: 'submit', values });
    assert.deepStrictEqual(JSON.parse(readFileSync(at('Autoencoder', 'manual_paper.json'), 'utf8')), {
      title: '수동 입력 논문',
      authors: 'Kim, Lee',
      year: 2025,
      source: 'manual',
    });
    assert.strictEqual(api.metaEditor.html, undefined, '저장하면 폼을 닫는다');
  });

  test('메타 정보 편집: 바꾼 필드만 저장하고 모르는 필드는 남긴다', async () => {
    data.put('Autoencoder/manual_paper.json', JSON.stringify({ title: '수동 입력 논문', authors: 'Kim, Lee', year: 2025, source: 'manual', x_other: 1 }, null, 2));
    await vscode.commands.executeCommand('arxivjs.editPaperMeta', await target('Autoencoder', 'manual_paper'));
    await api.metaEditor.handleMessage({
      type: 'submit',
      values: { title: '고친 제목', authors: 'Kim, Lee', year: '2025', url: '', abstract: '', citation: '7', source: 'manual', paperId: '' },
    });
    assert.deepStrictEqual(JSON.parse(readFileSync(at('Autoencoder', 'manual_paper.json'), 'utf8')), {
      title: '고친 제목',
      authors: 'Kim, Lee',
      year: 2025,
      source: 'manual',
      x_other: 1,
      citation: 7,
    });
    assert.deepStrictEqual(files('Autoencoder', 'manual_paper'), ['manual_paper.json'], '파일 이름은 그대로다');
  });

  test('요약 생성: PDF → 작업자 추출 → .txt → Ollama → .md', async () => {
    await vscode.commands.executeCommand('arxivjs.summarizePaper', await target(RL, ARXIV_STEM));
    assert.strictEqual(readFileSync(at(RL, `${ARXIV_STEM}.md`), 'utf8'), SUMMARY);
    assert.match(readFileSync(at(RL, `${ARXIV_STEM}.txt`), 'utf8'), /Few-shot full text/);
    const prompt = JSON.parse(requests.find((r) => r.url.endsWith('/api/generate'))!.body!).prompt as string;
    assert.match(prompt, /^Summarize this paper\.\n\n[\s\S]*Few-shot full text/);
    assert.match(api.panels.htmlOf(`${RL}/${ARXIV_STEM}`) ?? '', /Problem to Solve/, '열린 Paper 패널을 다시 그린다');
  });

  test('요약 삭제: .md를 지우고 .bak을 남기지 않는다', async () => {
    ui.confirms.push('Delete');
    await vscode.commands.executeCommand('arxivjs.deleteSummary', await target(RL, ARXIV_STEM));
    assert.deepStrictEqual(files(RL, ARXIV_STEM), [`${ARXIV_STEM}.json`, `${ARXIV_STEM}.txt`]);
  });

  test('주제 이름 변경: 폴더만 바뀌고 파일은 그대로다', async () => {
    ui.inputs.push('Reinforcement Learning');
    await vscode.commands.executeCommand('arxivjs.renameTopic', { kind: 'topic', topic: await topic(RL) });
    assert.strictEqual(existsSync(at(RL)), false);
    assert.deepStrictEqual(files(RL_RENAMED, ARXIV_STEM), [`${ARXIV_STEM}.json`, `${ARXIV_STEM}.txt`]);
    assert.ok(!api.panels.openPaperIds.some((id) => id.startsWith(`${RL}/`)), '옛 주제의 논문 탭은 닫는다');
  });

  test('논문 이동: 대상에 같은 논문이 있으면 묻고 형식 명세 §9.3대로 처리한다', async () => {
    // Cosine_Similarity에 같은 파일 이름의 논문이 있다. 날짜가 없으므로 대상을 남기고 원본을 지운다.
    ui.picks.push((items) => items.find((i) => (i.topic as Topic | undefined)?.id === 'Cosine_Similarity'));
    ui.confirms.push('Continue');
    await vscode.commands.executeCommand('arxivjs.movePaper', await target(RL_RENAMED, ARXIV_STEM));
    assert.deepStrictEqual(readdirSync(at(RL_RENAMED)), []);
    assert.ok(existsSync(at('Cosine_Similarity', `${ARXIV_STEM}.txt`)), '대상에 없던 .txt는 옮긴다');
    assert.ok(ui.messages.some((m) => m.includes('Kept the existing paper')));
  });

  test('주제 삭제: 비어 있지 않으면 지우지 않고, 비어 있으면 확인 후 지운다', async () => {
    await vscode.commands.executeCommand('arxivjs.deleteTopic', { kind: 'topic', topic: await topic('Broken_Data') });
    assert.ok(existsSync(at('Broken_Data')));
    const refused = ui.messages.find((m) => m.includes('is not empty and cannot be deleted'));
    assert.ok(refused?.startsWith('ERROR '));
    ui.messages.length = 0; // 의도한 오류 알림

    ui.confirms.push('Delete');
    await vscode.commands.executeCommand('arxivjs.deleteTopic', { kind: 'topic', topic: await topic(RL_RENAMED) });
    assert.strictEqual(existsSync(at(RL_RENAMED)), false);
  });

  test('논문 삭제: .json, .md, .hlt, .txt를 지우고 백업은 남긴다', async () => {
    ui.confirms.push('Delete');
    await vscode.commands.executeCommand('arxivjs.deletePaper', await target('Broken_Data', 'valid_paper'));
    assert.deepStrictEqual(files('Broken_Data', 'valid_paper'), ['valid_paper.bak', 'valid_paper.md.bak']);
  });

  test('쓰기를 끄면 명령이 아무것도 쓰지 않는다', async () => {
    await setConfig('enableWrite', false);
    await vscode.commands.executeCommand('arxivjs.createTopic'); // 입력 창을 띄우지 않고 안내만 한다.
    await vscode.commands.executeCommand('arxivjs.deletePaper', await target('Autoencoder', 'manual_paper'));
    assert.ok(existsSync(at('Autoencoder', 'manual_paper.json')));
    assert.ok(ui.messages.every((m) => m.includes('write support is off')));
    await setConfig('enableWrite', true);
  });
});
