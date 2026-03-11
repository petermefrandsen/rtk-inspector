import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('petermefrandsen.rtk-inspector'));
	});

	test('should activate', async () => {
		const ext = vscode.extensions.getExtension('petermefrandsen.rtk-inspector');
		await ext?.activate();
		assert.strictEqual(ext?.isActive, true);
	});
});
