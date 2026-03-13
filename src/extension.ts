import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { ChartsViewProvider } from './chartsViewProvider';
import { CLIUsageProvider } from './cliUsageProvider';
import * as cp from 'child_process';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create Standard Output Channel (more reliable than LogOutputChannel for simple text)
    outputChannel = vscode.window.createOutputChannel('RTK Inspector');
    context.subscriptions.push(outputChannel);
    
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] [INFO] RTK Inspector Extension activated`);

    const rtkProvider = new RTKProvider(outputChannel);
    const cliUsageProvider = new CLIUsageProvider();

    // Register Sidebar
    const chartsViewProvider = new ChartsViewProvider(context.extensionUri, rtkProvider, cliUsageProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChartsViewProvider.viewType, chartsViewProvider)
    );

    // Register Refresh Command
    const refreshCommand = vscode.commands.registerCommand('rtk-inspector.refresh', () => {
        outputChannel.appendLine(`[${new Date().toISOString()}] [INFO] Manual refresh triggered`);
        chartsViewProvider.refresh();
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
    const cmdVersion = rtkProvider.getCommand('--version');
    outputChannel.appendLine(`Testing Version Command: ${cmdVersion}`);

    const execOptions = rtkProvider.getExecOptions();
    cp.exec(cmdVersion, execOptions, (error, stdout, stderr) => {
        if (error) {
            outputChannel.appendLine(`RTK Check: FAILED`);
            outputChannel.appendLine(`Error: ${error.message}`);
            outputChannel.appendLine(`Stderr: ${stderr}`);
            vscode.window.showErrorMessage(`RTK CLI not found. If using WSL, ensure 'rtk-inspector.useWsl' is enabled in settings.`);
        } else {
            outputChannel.appendLine(`RTK Check: SUCCESS`);
            outputChannel.appendLine(`Version: ${stdout.toString().trim()}`);
        }
    });

    outputChannel.appendLine(`PATH: ${process.env.PATH}`);
    outputChannel.appendLine('-----------------------');
}

export function deactivate() {}
