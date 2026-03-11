import * as vscode from 'vscode';
import { RTKProvider } from './rtkProvider';
import { ChartsViewProvider } from './chartsViewProvider';
import { SummaryViewProvider } from './summaryViewProvider';

export function activate(context: vscode.ExtensionContext) {
    const rtkProvider = new RTKProvider();

    const chartsProvider = new ChartsViewProvider(context.extensionUri, rtkProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChartsViewProvider.viewType, chartsProvider)
    );

    const summaryProvider = new SummaryViewProvider(context.extensionUri, rtkProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SummaryViewProvider.viewType, summaryProvider)
    );

    let refreshCommand = vscode.commands.registerCommand('rtk-inspector.refresh', () => {
        chartsProvider.update();
        summaryProvider.update();
        vscode.window.showInformationMessage('RTK Stats Refreshed');
    });

    context.subscriptions.push(refreshCommand);
}

export function deactivate() {}
