import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';

export class SummaryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rtk-inspector-summary';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _rtkProvider: RTKProvider
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this.update();
    }

    public async update() {
        if (!this._view) {return;}

        const stats = await this._rtkProvider.getStats();
        if (!stats) {
            this._view.webview.html = `<div>Failed to load summary</div>`;
            return;
        }

        this._view.webview.html = this._getHtmlForWebview(stats.summary);
    }

    public refresh() {
        this.update();
    }

    private _getHtmlForWebview(summary: any) {
        const formatTokens = (t: number) => {
            if (t > 1000000) {return (t / 1000000).toFixed(1) + 'M';}
            if (t > 1000) {return (t / 1000).toFixed(1) + 'K';}
            return t.toString();
        };

        const formatTime = (ms: number) => {
            const s = Math.floor(ms / 1000);
            const m = Math.floor(s / 60);
            const h = Math.floor(m / 60);
            if (h > 0) {return `${h}h ${m % 60}m`;}
            if (m > 0) {return `${m}m ${s % 60}s`;}
            return `${s}s`;
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); padding: 15px; border-radius: 5px; text-align: center; }
        .value { font-size: 24px; font-weight: bold; color: #3B82F6; }
        .label { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px; text-transform: uppercase; }
        .efficiency { margin-top: 20px; text-align: center; }
        .meter-bg { background: #444; height: 10px; border-radius: 5px; overflow: hidden; margin: 10px 0; }
        .meter-fill { background: #10B981; height: 100%; }
    </style>
</head>
<body>
    <div class="grid">
        <div class="card">
            <div class="value">${summary.total_commands}</div>
            <div class="label">Total Commands</div>
        </div>
        <div class="card">
            <div class="value">${formatTokens(summary.total_saved)}</div>
            <div class="label">Tokens Saved</div>
        </div>
        <div class="card">
            <div class="value">${summary.avg_savings_pct.toFixed(1)}%</div>
            <div class="label">Avg Efficiency</div>
        </div>
        <div class="card">
            <div class="value">${formatTime(summary.total_time_ms)}</div>
            <div class="label">Total Time Saved</div>
        </div>
    </div>

    <div class="efficiency">
        <div class="label">Efficiency Meter</div>
        <div class="meter-bg">
            <div class="meter-fill" style="width: ${summary.avg_savings_pct}%"></div>
        </div>
        <div>${summary.avg_savings_pct.toFixed(1)}% of all context tokens saved</div>
    </div>
</body>
</html>`;
    }
}
