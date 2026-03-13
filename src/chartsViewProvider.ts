import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { CLIUsageProvider, CLIUsage } from './cliUsageProvider';

export class ChartsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rtk-inspector-charts';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _rtkProvider: RTKProvider,
        private readonly _cliUsageProvider: CLIUsageProvider
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
        const cliUsage = this._cliUsageProvider.getUsage();

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

        this._view.webview.html = this._getHtmlForWebview(stats, commands, versionInfo, cliUsage);
    }

    public refresh() {
        this.update();
    }

    private _getHtmlForWebview(stats: any, commands: any[], versionInfo: any, cliUsage: CLIUsage) {
        const dailyData = stats.daily || [];
        const labels = dailyData.map((d: any) => d.date);
        const savings = dailyData.map((d: any) => d.saved_tokens);
        const inputTokens = dailyData.map((d: any) => d.input_tokens);
        const outputTokens = dailyData.map((d: any) => d.output_tokens);

        const summary = stats.summary;

        // Only count CLI tokens on days where RTK also has data (apples-to-apples comparison)
        const rtkDateSet = new Set<string>(labels);
        const cliDailyMap = new Map<string, number>(cliUsage.daily.map(d => [d.date, d.tokens]));
        const cliDailyAligned = labels.map((l: string) => cliDailyMap.get(l) ?? 0);
        const cliTotalOverlap = cliDailyAligned.reduce((s: number, t: number) => s + t, 0);

        // Savings formula: rtk_total_saved / (cli_overlap_total + rtk_total_input)
        const realSavingsPct = (cliTotalOverlap + summary.total_input) > 0
            ? (summary.total_saved / (cliTotalOverlap + summary.total_input) * 100)
            : 0;

        // Per-CLI overlap values for the donut chart
        // Palette assigned per known CLI name, fallback to grey
        const CLI_COLORS: Record<string, string> = {
            'GitHub Copilot': '#3B82F6',
            'Claude Code':    '#F59E0B',
            'Gemini CLI':     '#8B5CF6',
        };
        const perCliOverlap = cliUsage.by_cli.map(c => ({
            name: c.name,
            tokens: c.daily.filter(d => rtkDateSet.has(d.date)).reduce((s, d) => s + d.tokens, 0),
            // Daily values aligned to RTK date labels for the line chart
            daily: labels.map((l: string) => {
                const day = c.daily.find(d => d.date === l);
                return day ? day.tokens : 0;
            }),
            color: CLI_COLORS[c.name] ?? '#6B7280',
        })).filter(c => c.tokens > 0);

        // Donut segments: RTK Saved first, then per-CLI slices
        const donutLabels  = ['RTK Saved', ...perCliOverlap.map(c => c.name)];
        const donutData    = [summary.total_saved, ...perCliOverlap.map(c => c.tokens)];
        const donutColors  = ['#10B981', ...perCliOverlap.map(c => c.color)];

        // Per-CLI sublabel for the stat card
        const cliBreakdown = perCliOverlap.map(c => `${c.name}: ${c.tokens.toLocaleString()}`).join(' | ');

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
            flex: 1 1 calc(50% - 4px); /* 2-column layout */
            background: var(--vscode-editor-background); 
            border: 1px solid var(--vscode-panel-border); 
            padding: 10px 5px; 
            border-radius: 4px; 
            text-align: center;
            box-sizing: border-box;
        }
        .card .value { font-size: 16px; font-weight: bold; color: #3B82F6; }
        .card .value.purple { color: #8B5CF6; }
        .card .value.orange { color: #F59E0B; }
        .card .value.red { color: #EF4444; }
        .card .value.green { color: #10B981; }
        .card .label { font-size: 9px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
        .card .sublabel { font-size: 8px; color: var(--vscode-descriptionForeground); opacity: 0.7; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .chart-container { position: relative; height: 160px; width: 100%; margin-bottom: 20px; }
        .chart-container.tall { height: 260px; }

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
    <h3>Summary <span style="font-weight:normal;opacity:0.6;font-size:0.85em">(since ${labels.length > 0 ? (() => { const [y,m,d] = (labels[0] as string).split('-'); return `${d}-${m}-${y}`; })() : ''})</span></h3>
    <div class="summary-grid">
        <div class="card">
            <div class="value">${summary.total_commands}</div>
            <div class="label">RTK Commands</div>
        </div>
        <div class="card">
            <div class="value">${cliUsage.total_tool_calls.toLocaleString()}</div>
            <div class="label">CLI Tool Calls</div>
            <div class="sublabel" title="${cliUsage.by_cli.map(c => `${c.name}: ${c.total_tool_calls.toLocaleString()}`).join(' | ')}">${cliUsage.by_cli.map(c => `${c.name}: ${c.total_tool_calls.toLocaleString()}`).join(' | ')}</div>
        </div>
        <div class="card">
            <div class="value green">${formatTokens(summary.total_saved)}</div>
            <div class="label">RTK Saved</div>
        </div>
        <div class="card">
            <div class="value">${summary.avg_savings_pct.toFixed(1)}%</div>
            <div class="label">RTK Efficiency</div>
        </div>
        <div class="card">
            <div class="value">${(summary.total_time_ms / 60000).toFixed(0)}m</div>
            <div class="label">Time Saved</div>
        </div>
        <div class="card">
            <div class="value purple">${formatTokens(summary.total_input)}</div>
            <div class="label">RTK Input</div>
        </div>
        <div class="card">
            <div class="value orange">${formatTokens(summary.total_output)}</div>
            <div class="label">RTK Output</div>
        </div>
        <div class="card">
            <div class="value red">${formatTokens(cliTotalOverlap)}</div>
            <div class="label">CLI Total</div>
            ${cliBreakdown ? `<div class="sublabel" title="${cliBreakdown}">${cliBreakdown}</div>` : ''}
        </div>
        <div class="card">
            <div class="value green">${realSavingsPct.toFixed(1)}%</div>
            <div class="label">True Savings</div>
            <div class="sublabel">saved / (CLI + RTK input)</div>
        </div>
    </div>

    <details>
        <summary>Currently Supported Commands</summary>
        <div class="cmd-list">
            ${commandRows}
        </div>
    </details>

    <h3>Daily Token Savings</h3>
    <div class="chart-container tall">
        <canvas id="dailyChart"></canvas>
    </div>

    <h3>Token Breakdown</h3>
    <div class="chart-container" style="height: 200px;">
        <canvas id="donutChart"></canvas>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function sendMsg(cmd) { vscode.postMessage({ command: cmd }); }

        const fgColor = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';

        // Build per-CLI datasets (same colours as the donut)
        const perCliDatasets = ${JSON.stringify(perCliOverlap.map(c => ({
            label: c.name,
            data: c.daily,
            borderColor: c.color,
            tension: 0.1,
            fill: false,
        })))};

        const ctxDaily = document.getElementById('dailyChart').getContext('2d');
        new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(labels)},
                datasets: [
                    ...perCliDatasets,
                    {
                        label: 'RTK Input',
                        data: ${JSON.stringify(inputTokens)},
                        borderColor: '#EF4444',
                        borderDash: [4, 3],
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'RTK Output',
                        data: ${JSON.stringify(outputTokens)},
                        borderColor: '#F97316',
                        borderDash: [4, 3],
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'RTK Saved',
                        data: ${JSON.stringify(savings)},
                        borderColor: '#10B981',
                        tension: 0.1,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: fgColor, boxWidth: 12, font: { size: 10 } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#444' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const ctxDonut = document.getElementById('donutChart').getContext('2d');
        new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(donutLabels)},
                datasets: [{
                    data: ${JSON.stringify(donutData)},
                    backgroundColor: ${JSON.stringify(donutColors)}
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: fgColor, boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                                const val = ctx.parsed > 1000000
                                    ? (ctx.parsed / 1000000).toFixed(1) + 'M'
                                    : ctx.parsed > 1000
                                        ? (ctx.parsed / 1000).toFixed(1) + 'K'
                                        : ctx.parsed.toString();
                                return ' ' + ctx.label + ': ' + val + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
