import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';

export class ChartsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rtk-inspector-charts';
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

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'showLogs':
                    vscode.commands.executeCommand('rtk-inspector.showLogs');
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:PeterMEFrandsen.rtk-inspector');
                    break;
                case 'openRepo':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/rtk-ai/rtk'));
                    break;
            }
        });

        this.update();
    }

    public async update() {
        if (!this._view) {return;}
        
        const [stats, commands, versionInfo] = await Promise.all([
            this._rtkProvider.getStats(),
            this._rtkProvider.getCommands(),
            this._rtkProvider.getVersions()
        ]);

        if (!stats) {
            this._view.webview.html = `
                <div style="padding: 20px; text-align: center;">
                    <p>Failed to load RTK stats.</p>
                    <p style="font-size: 0.9em; opacity: 0.8;">Check if <b>rtk</b> CLI is installed and in your PATH.</p>
                    <p style="margin-top: 20px;">
                        <button onclick="sendMsg('showLogs')" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 2px;">View Logs</button>
                    </p>
                    <p style="margin-top: 10px;">
                        <button onclick="sendMsg('openSettings')" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 2px;">Open Settings</button>
                    </p>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function sendMsg(cmd) { vscode.postMessage({ command: cmd }); }
                </script>
            `;
            return;
        }

        this._view.webview.html = this._getHtmlForWebview(stats, commands, versionInfo);
    }

    public refresh() {
        this.update();
    }

    private _getHtmlForWebview(stats: any, commands: any[], versionInfo: any) {
        const dailyData = stats.daily || [];
        const labels = dailyData.map((d: any) => d.date);
        const savings = dailyData.map((d: any) => d.saved_tokens);
        
        const summary = stats.summary;

        const formatTokens = (t: number) => {
            if (t > 1000000) {return (t / 1000000).toFixed(1) + 'M';}
            if (t > 1000) {return (t / 1000).toFixed(1) + 'K';}
            return t.toString();
        };

        const commandRows = commands.map(c => `
            <div class="cmd-row">
                <span class="cmd-name">${c.name}</span>
                <span class="cmd-desc">${c.description}</span>
            </div>
        `).join('');

        const updateBanner = (versionInfo && versionInfo.isOutOfDate) ? `
            <div class="update-banner">
                <span>Update available: <b>${versionInfo.latest}</b></span>
                <button onclick="sendMsg('openRepo')">Update</button>
            </div>
        ` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
        h3 { margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; font-size: 11px; text-transform: uppercase; opacity: 0.8; }
        
        /* Update Banner */
        .update-banner { 
            background: var(--vscode-statusBarItem-warningBackground); 
            color: var(--vscode-statusBarItem-warningForeground); 
            padding: 8px; 
            margin-bottom: 15px; 
            border-radius: 4px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            font-size: 11px;
        }
        .update-banner button { 
            background: #ffffff; 
            color: #000000; 
            border: none; 
            padding: 2px 8px; 
            cursor: pointer; 
            border-radius: 2px; 
            font-weight: bold;
        }

        /* Summary Grid */
        .summary-grid { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 8px; 
            margin-bottom: 20px;
        }
        .card { 
            flex: 1 1 calc(50% - 4px); /* 2x2 grid */
            background: var(--vscode-editor-background); 
            border: 1px solid var(--vscode-panel-border); 
            padding: 10px 5px; 
            border-radius: 4px; 
            text-align: center;
            box-sizing: border-box;
        }
        .card .value { font-size: 16px; font-weight: bold; color: #3B82F6; }
        .card .label { font-size: 9px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

        .chart-container { position: relative; height: 160px; width: 100%; margin-bottom: 20px; }

        /* Commands Section */
        details { margin-bottom: 20px; cursor: pointer; }
        summary { font-size: 11px; text-transform: uppercase; opacity: 0.8; font-weight: bold; padding-bottom: 5px; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 5px; }
        .cmd-list { padding: 5px 0; max-height: 200px; overflow-y: auto; }
        .cmd-row { display: flex; padding: 4px 0; font-size: 11px; border-bottom: 1px solid #333; }
        .cmd-name { font-weight: bold; color: #60A5FA; width: 80px; flex-shrink: 0; }
        .cmd-desc { opacity: 0.8; }
    </style>
</head>
<body>
    ${updateBanner}
    <h3>Summary</h3>
    <div class="summary-grid">
        <div class="card">
            <div class="value">${summary.total_commands}</div>
            <div class="label">Commands</div>
        </div>
        <div class="card">
            <div class="value">${formatTokens(summary.total_saved)}</div>
            <div class="label">Saved</div>
        </div>
        <div class="card">
            <div class="value">${summary.avg_savings_pct.toFixed(1)}%</div>
            <div class="label">Efficiency</div>
        </div>
        <div class="card">
            <div class="value">${(summary.total_time_ms / 60000).toFixed(0)}m</div>
            <div class="label">Time Saved</div>
        </div>
    </div>

    <details>
        <summary>Currently Supported Commands</summary>
        <div class="cmd-list">
            ${commandRows}
        </div>
    </details>

    <h3>Daily Token Savings</h3>
    <div class="chart-container">
        <canvas id="dailyChart"></canvas>
    </div>

    <h3>Token Distribution</h3>
    <div class="chart-container">
        <canvas id="distChart"></canvas>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function sendMsg(cmd) { vscode.postMessage({ command: cmd }); }

        const ctxDaily = document.getElementById('dailyChart').getContext('2d');
        new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(labels)},
                datasets: [{
                    label: 'Saved Tokens',
                    data: ${JSON.stringify(savings)},
                    borderColor: '#3B82F6',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#444' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const ctxDist = document.getElementById('distChart').getContext('2d');
        new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Output Tokens', 'Saved Tokens'],
                datasets: [{
                    data: [${summary.total_output}, ${summary.total_saved}],
                    backgroundColor: ['#60A5FA', '#10B981']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'white' } }
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
