import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { ChartsViewProvider } from './chartsViewProvider';
import { SummaryViewProvider } from './summaryViewProvider';

let rtkStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    const rtkProvider = new RTKProvider();

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
        chartsViewProvider.refresh();
        summaryViewProvider.refresh();
        updateStatusBarItem(rtkProvider);
    });
    context.subscriptions.push(refreshCommand);

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
        const pct = (stats.summary.avg_savings_pct * 100).toFixed(1);
        rtkStatusBarItem.text = `$(rocket) RTK: ${saved} (${pct}%)`;
        rtkStatusBarItem.tooltip = `RTK Tokens Saved: ${saved} (${pct}% efficiency)`;
        rtkStatusBarItem.show();
    } else {
        rtkStatusBarItem.hide();
    }
}

export function deactivate() {}
