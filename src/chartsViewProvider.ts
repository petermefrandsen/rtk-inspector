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

        this.update();
    }

    public async update() {
        if (!this._view) {return;}
        
        const stats = await this._rtkProvider.getStats();
        if (!stats) {
            this._view.webview.html = `<div>Failed to load stats</div>`;
            return;
        }

        this._view.webview.html = this._getHtmlForWebview(stats);
    }

    private _getHtmlForWebview(stats: any) {
        const dailyData = stats.daily || [];
        const labels = dailyData.map((d: any) => d.date);
        const savings = dailyData.map((d: any) => d.saved_tokens);
        
        const summary = stats.summary;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
        .chart-container { position: relative; height: 200px; width: 100%; margin-bottom: 20px; }
        h3 { margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
    </style>
</head>
<body>
    <h3>Daily Token Savings</h3>
    <div class="chart-container">
        <canvas id="dailyChart"></canvas>
    </div>

    <h3>Token Distribution</h3>
    <div class="chart-container">
        <canvas id="distChart"></canvas>
    </div>

    <script>
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
