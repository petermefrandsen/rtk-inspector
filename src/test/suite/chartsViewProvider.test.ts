import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChartsViewProvider } from '../../chartsViewProvider';

// -------------------------------------------------------------------------
// Minimal mock of vscode.WebviewView
// -------------------------------------------------------------------------
function makeMockWebviewView() {
    let capturedHtml = '';
    const msgListeners: Function[] = [];

    const webviewView: any = {
        webview: {
            options: {},
            get html() { return capturedHtml; },
            set html(v: string) { capturedHtml = v; },
            onDidReceiveMessage: (handler: Function) => {
                msgListeners.push(handler);
                return { dispose: () => {} };
            },
            asWebviewUri: (uri: vscode.Uri) => uri,
        },
        _triggerMessage: (msg: any) => msgListeners.forEach(h => h(msg)),
        _getHtml: () => capturedHtml,
    };
    return webviewView;
}

// -------------------------------------------------------------------------
// Minimal mock providers
// -------------------------------------------------------------------------
function makeMockRtkProvider(stats: any, commands: any[] = [], versions: any = null) {
    return {
        getStats:    async () => stats,
        getCommands: async () => commands,
        getVersions: async () => versions,
    } as any;
}

function makeMockCliProvider(usage?: any) {
    return {
        getUsage: () => usage ?? {
            total_tokens: 0,
            total_tool_calls: 0,
            by_cli: [],
            daily: [],
        },
    } as any;
}

const MOCK_STATS = {
    summary: {
        total_commands: 42,
        total_input: 10000,
        total_output: 8000,
        total_saved: 5000,
        avg_savings_pct: 38.5,
        total_time_ms: 12000,
        avg_time_ms: 285,
    },
    daily: [
        { date: '2024-06-01', commands: 10, input_tokens: 3000, output_tokens: 2500, saved_tokens: 1500, savings_pct: 37, total_time_ms: 4000, avg_time_ms: 400 },
        { date: '2024-06-02', commands: 15, input_tokens: 4000, output_tokens: 3200, saved_tokens: 2000, savings_pct: 38, total_time_ms: 5000, avg_time_ms: 333 },
        { date: '2024-06-03', commands: 17, input_tokens: 3000, output_tokens: 2300, saved_tokens: 1500, savings_pct: 39, total_time_ms: 3000, avg_time_ms: 176 },
    ],
};

// =========================================================================
suite('ChartsViewProvider Test Suite', () => {

    test('should set HTML on resolveWebviewView with valid stats', async () => {
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS, [{ name: 'gain', description: 'Show savings' }]),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);

        // resolveWebviewView calls update() which is async — wait for it
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('<!DOCTYPE html>'), 'Should produce full HTML page');
        assert.ok(html.includes('cdn.jsdelivr.net'), 'Should include Chart.js CDN script');
        assert.ok(html.includes('42'), 'Should include RTK command count');
    });

    test('should show error HTML when stats is null', async () => {
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(null),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('Failed to load RTK stats'), 'Should show error message');
    });

    test('should show update banner when version is out of date', async () => {
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS, [], { current: '0.28.0', latest: '0.29.0', isOutOfDate: true }),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('0.29.0'), 'Should show latest version in banner');
        assert.ok(html.includes('Update available'), 'Should show update banner');
    });

    test('should include CLI data in HTML when CLIs have tokens', async () => {
        const cliUsage = {
            total_tokens: 1500000,
            total_tool_calls: 630,
            by_cli: [
                {
                    name: 'GitHub Copilot',
                    total_tokens: 500000,
                    total_tool_calls: 200,
                    daily: [
                        { date: '2024-06-01', tokens: 200000 },
                        { date: '2024-06-02', tokens: 300000 },
                    ],
                },
                {
                    name: 'Gemini CLI',
                    total_tokens: 1000000,
                    total_tool_calls: 430,
                    daily: [
                        { date: '2024-06-01', tokens: 500000 },
                        { date: '2024-06-03', tokens: 500000 },
                    ],
                },
            ],
            daily: [
                { date: '2024-06-01', tokens: 700000 },
                { date: '2024-06-02', tokens: 300000 },
                { date: '2024-06-03', tokens: 500000 },
            ],
        };

        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS),
            makeMockCliProvider(cliUsage),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('GitHub Copilot'), 'Should include Copilot in HTML');
        assert.ok(html.includes('Gemini CLI'), 'Should include Gemini in HTML');
        assert.ok(html.includes('True Savings'), 'Should include true savings card');
        assert.ok(html.includes('CLI Total'), 'Should include CLI total card');
    });

    test('should include since date in summary heading', async () => {
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('since 01-06-2024'), 'Should show formatted start date');
    });

    test('should handle empty daily array gracefully', async () => {
        const statsNoDailyData = {
            summary: { ...MOCK_STATS.summary },
            daily: [],
        };

        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(statsNoDailyData),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('<!DOCTYPE html>'));
        // No start date when no daily data
        assert.ok(html.includes('(since )') || !html.includes('since '), 'Should handle empty labels gracefully');
    });

    test('should render commands list when commands provided', async () => {
        const commands = [
            { name: 'gain', description: 'Show token savings' },
            { name: 'watch', description: 'Watch mode' },
        ];

        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS, commands),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(html.includes('gain'), 'Should include command name');
        assert.ok(html.includes('Show token savings'), 'Should include command description');
    });

    test('refresh() should re-trigger update', async () => {
        let callCount = 0;
        const rtkProvider = {
            getStats:    async () => { callCount++; return MOCK_STATS; },
            getCommands: async () => [],
            getVersions: async () => null,
        } as any;

        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            rtkProvider,
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        provider.refresh();
        await new Promise(r => setTimeout(r, 200));

        assert.ok(callCount >= 2, 'getStats should be called at least twice (initial + refresh)');
    });

    test('should handle onDidReceiveMessage for showLogs, openSettings, openRepo', async () => {
        const executedCommands: string[] = [];
        const openedUris: string[] = [];

        // Mock vscode.commands.executeCommand via the existing command in test extension
        // We just test that resolveWebviewView doesn't throw when messages arrive
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        // Trigger messages — just ensure no throw
        assert.doesNotThrow(() => {
            mockView._triggerMessage({ command: 'showLogs' });
            mockView._triggerMessage({ command: 'openSettings' });
            mockView._triggerMessage({ command: 'openRepo' });
            mockView._triggerMessage({ command: 'unknown' });
        });
    });

    test('should not render update banner when version is up-to-date', async () => {
        const provider = new ChartsViewProvider(
            vscode.Uri.file('/'),
            makeMockRtkProvider(MOCK_STATS, [], { current: '0.29.0', latest: '0.29.0', isOutOfDate: false }),
            makeMockCliProvider(),
        );

        const mockView = makeMockWebviewView();
        provider.resolveWebviewView(mockView, {} as any, {} as any);
        await new Promise(r => setTimeout(r, 200));

        const html = mockView._getHtml();
        assert.ok(!html.includes('update-banner') || html.includes('update-banner" style="display:none"') || !html.includes('Update available'), 'No update banner when up to date');
    });
});
