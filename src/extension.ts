import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { ChartsViewProvider } from './chartsViewProvider';
import { SummaryViewProvider } from './summaryViewProvider';
import * as cp from 'child_process';

let rtkStatusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create Standard Output Channel (more reliable than LogOutputChannel for simple text)
    outputChannel = vscode.window.createOutputChannel('RTK Inspector');
    context.subscriptions.push(outputChannel);
    
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] [INFO] RTK Inspector Extension activated`);

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
        outputChannel.appendLine(`[${new Date().toISOString()}] [INFO] Manual refresh triggered`);
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

    // Register Diagnostics Command
    const diagnosticsCommand = vscode.commands.registerCommand('rtk-inspector.runDiagnostics', () => {
        runDiagnostics(rtkProvider);
    });
    context.subscriptions.push(diagnosticsCommand);

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

function runDiagnostics(rtkProvider: RTKProvider) {
    outputChannel.show();
    outputChannel.appendLine('--- RTK Diagnostics ---');
    outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
    outputChannel.appendLine(`Platform: ${process.platform}`);
    outputChannel.appendLine(`Remote Name: ${vscode.env.remoteName || 'local'}`);
    
    const config = vscode.workspace.getConfiguration('rtk-inspector');
    outputChannel.appendLine(`Config: executablePath = "${config.get('executablePath')}"`);
    outputChannel.appendLine(`Config: useWsl = ${config.get('useWsl')}`);
    
    // Using internal getCommand for testing
    const cmdVersion = (rtkProvider as any).getCommand('--version');
    outputChannel.appendLine(`Testing Version Command: ${cmdVersion}`);

    cp.exec(cmdVersion, (error, stdout, stderr) => {
        if (error) {
            outputChannel.appendLine(`RTK Check: FAILED`);
            outputChannel.appendLine(`Error: ${error.message}`);
            outputChannel.appendLine(`Stderr: ${stderr}`);
            vscode.window.showErrorMessage(`RTK CLI not found. If using WSL, ensure 'rtk-inspector.useWsl' is enabled in settings.`);
        } else {
            outputChannel.appendLine(`RTK Check: SUCCESS`);
            outputChannel.appendLine(`Version: ${stdout.trim()}`);
        }
    });

    outputChannel.appendLine(`PATH: ${process.env.PATH}`);
    outputChannel.appendLine('-----------------------');
}

export function deactivate() {}
