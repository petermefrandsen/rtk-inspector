---
description: VS Code Extension Development Best Practices
---
# VS Code Extension Development

This skill documents the best practices an AI Agent should follow when implementing the `rtk-inspector` VS Code extension.

## Core Rules

1. **Strict TypeScript**: 
   - Always use strong typing. Define interfaces for expected CLI JSON outputs or parsed objects.
   - Avoid `any`.

2. **Non-Blocking Operations**:
   - Never block the main VS Code extension thread.
   - Any execution of the `rtk` CLI must be done asynchronously using `child_process.exec` or `child_process.spawn` wrapped in Promises.
   - Use `vscode.window.withProgress` to show a spinning progress indicator in the notification area or Source Control view while long-running CLI commands execute.

3. **Command Registration**:
   - Register all commands in `src/extension.ts` using `vscode.commands.registerCommand`.
   - Ensure every active command is also declared in `package.json` under `contributes.commands`.

4. **Error Handling & UX**:
   - If the `rtk` CLI is not found on the user's `$PATH`, do not crash. Catch the execution error and display a helpful `vscode.window.showErrorMessage` suggesting they install it.
   - Always log underlying errors to a dedicated Output Channel using `vscode.window.createOutputChannel("RTK Inspector")`.

5. **Webview vs. Native UI**:
   - For chart visualization (e.g., Chart.js), use Webviews.
   - Prefer native VS Code UI components (InputBox, QuickPick, TreeView) over Webviews for simplicity and performance when displaying basic lists or gathering input.
