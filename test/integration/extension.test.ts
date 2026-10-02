import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'arxivjs.arxivjs-viewer';

suite('ArxivJS Viewer (smoke)', () => {
  test('확장이 설치되어 있고 활성화된다', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `${EXTENSION_ID} 확장을 찾을 수 없다`);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('설정 항목의 기본값이 등록되어 있다', () => {
    const config = vscode.workspace.getConfiguration('arxivjs');
    assert.strictEqual(config.get('dataFolder'), '');
    assert.strictEqual(config.get('paperSort'), 'citation');
    assert.strictEqual(config.get('openInNewTab'), false);
  });
});
