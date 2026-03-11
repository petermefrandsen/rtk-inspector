---
description: Integrating with the rtk CLI
---
# RTK CLI Integration

This skill documents how the `rtk-inspector` VS Code extension must interface with the `rtk` command-line tool.

## Key Concepts
The `rtk` CLI tracks token savings and command stats. The extension needs to visualize this data.

## Supported Commands Mapping
The extension needs to execute these specific commands:

1. **Installation Check**: 
   - Run `rtk --version` to verify the CLI is installed. If it fails, prompt the user to install the `rtk` CLI.
   
2. **Fetch Stats**: 
   - Run `rtk stats` or similar commands to retrieve token savings and command execution history. 
   - **Parser Requirement**: The extension must parse the `stdout` of this command, typically expected in JSON format (e.g., `rtk stats --json`).

## Execution Wrapper
Use a utility class `CliExecutor` wrapping `child_process.exec` (or `spawn` for streaming long outputs).
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runRtkCommand(args: string): Promise<{stdout: string, stderr: string}> {
    // Implement robust execution, path resolving, and error catching here
}
```
