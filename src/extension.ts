import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { ChartsViewProvider } from './chartsViewProvider';
import { SummaryViewProvider } from './summaryViewProvider';

let rtkStatusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.LogOutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create Output Channel
    outputChannel = vscode.window.createOutputChannel('RTK Inspector', { log: true });
    context.subscriptions.push(outputChannel);
    outputChannel.info('RTK Inspector Extension activated');

    const rtkProvider = new RTKProvider(outputChannel);

    // Register Sidebar
    const chartsViewProvider = new ChartsViewProvider(context.extensionUri, rtkProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChartsViewProvider.viewType, chartsViewProvider)
    );

    // Register Summary Panel
    const summaryViewProvider = new SummaryViewProvider(context.extensionUri, rtkProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SummaryViewProvider.viewType, summaryViewProvider)
    );

    // Register Refresh Command
    const refreshCommand = vscode.commands.registerCommand('rtk-inspector.refresh', () => {
        outputChannel.info('Manual refresh triggered');
        chartsViewProvider.refresh();
        summaryViewProvider.refresh();
        updateStatusBarItem(rtkProvider);
    });
    context.subscriptions.push(refreshCommand);

    // Register Show Logs Command
    const showLogsCommand = vscode.commands.registerCommand('rtk-inspector.showLogs', () => {
        outputChannel.show();
    });
    context.subscriptions.push(showLogsCommand);

    // Status Bar Item
    rtkStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    rtkStatusBarItem.command = 'rtk-inspector.refresh';
    context.subscriptions.push(rtkStatusBarItem);

    // Initial updates
    updateStatusBarItem(rtkProvider);

    // Refresh every 5 minutes
    const interval = setInterval(() => updateStatusBarItem(rtkProvider), 5 * 60 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

async function updateStatusBarItem(rtkProvider: RTKProvider): Promise<void> {
    const stats = await rtkProvider.getStats();
    if (stats && stats.summary) {
        const saved = stats.summary.total_saved.toLocaleString();
        const pct = stats.summary.avg_savings_pct.toFixed(1);
        rtkStatusBarItem.text = `RTK: ${saved} (${pct} %) tokens saved`;
        rtkStatusBarItem.tooltip = `RTK Tokens Saved: ${saved} (${pct}% efficiency)`;
        rtkStatusBarItem.show();
    } else {
        rtkStatusBarItem.text = `$(warning) RTK: Error`;
        rtkStatusBarItem.tooltip = `RTK command failed. Click to refresh or check 'RTK Inspector' output logs.`;
        rtkStatusBarItem.show();
    }
}

export function deactivate() {}
