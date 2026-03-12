import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface RTKSummary {
    total_commands: number;
    total_input: number;
    total_output: number;
    total_saved: number;
    avg_savings_pct: number;
    total_time_ms: number;
    avg_time_ms: number;
}

export interface RTKDaily {
    date: string;
    commands: number;
    input_tokens: number;
    output_tokens: number;
    saved_tokens: number;
    savings_pct: number;
    total_time_ms: number;
    avg_time_ms: number;
}

export interface RTKStats {
    summary: RTKSummary;
    daily?: RTKDaily[];
}

export interface RTKCommand {
    name: string;
    description: string;
}

export interface RTKVersionInfo {
    current: string;
    latest: string;
    isOutOfDate: boolean;
}

export class RTKProvider {
    constructor(private readonly _outputChannel?: vscode.OutputChannel) {}

    private log(message: string, type: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
        const timestamp = new Date().toISOString();
        this._outputChannel?.appendLine(`[${timestamp}] [${type}] ${message}`);
    }

    public getCommand(args: string): string {
        const config = vscode.workspace.getConfiguration('rtk-inspector');
        const executable = config.get<string>('executablePath', 'rtk');
        const useWsl = config.get<boolean>('useWsl', false);
        
        // If extension is already running in WSL, we don't need wsl.exe prefix
        const isRunningInWsl = vscode.env.remoteName === 'wsl';
        
        const fullCommand = `${executable} ${args}`;
        
        if (useWsl && !isRunningInWsl && process.platform === 'win32') {
            return `wsl.exe -e ${fullCommand}`;
        }
        
        return fullCommand;
    }

    public getExecOptions(): cp.ExecOptions {
        const env = { ...process.env };
        
        // Add common user bin paths if not already present
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir && (process.platform === 'linux' || process.platform === 'darwin')) {
            const extraPaths = [
                `${homeDir}/.local/bin`,
                `${homeDir}/bin`,
                '/usr/local/bin'
            ];
            
            const currentPath = env.PATH || '';
            const pathSeparator = ':';
            
            const missingPaths = extraPaths.filter(p => !currentPath.includes(p));
            if (missingPaths.length > 0) {
                env.PATH = [...missingPaths, currentPath].join(pathSeparator);
            }
        }
        
        return { env };
    }

    public async getStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            const cmd = this.getCommand('gain -d -f json');
            this.log(`Executing: ${cmd}`);
            
            cp.exec(cmd, this.getExecOptions(), (error, stdout, stderr) => {
                if (error) {
                    this.log(`Command failed: ${error.message}`, 'ERROR');
                    if (stderr) {this.log(`Stderr: ${stderr}`, 'ERROR');}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout.toString()) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    this.log(`Failed to parse JSON: ${e}`, 'ERROR');
                    this.log(`Raw Output: ${stdout}`, 'DEBUG');
                    resolve(null);
                }
            });
        });
    }

    public async getProjectStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            const cmd = this.getCommand('gain -p -f json');
            this.log(`Executing: ${cmd}`);
            
            cp.exec(cmd, this.getExecOptions(), (error, stdout, stderr) => {
                if (error) {
                    this.log(`Project Command failed: ${error.message}`, 'ERROR');
                    if (stderr) {this.log(`Project Stderr: ${stderr}`, 'ERROR');}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout.toString()) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    this.log(`Project JSON Parse Error: ${e}`, 'ERROR');
                    this.log(`Project Raw Output: ${stdout}`, 'DEBUG');
                    resolve(null);
                }
            });
        });
    }

    public async getCommands(): Promise<RTKCommand[]> {
        return new Promise((resolve) => {
            const cmd = this.getCommand('--help');
            cp.exec(cmd, this.getExecOptions(), (error, stdout) => {
                if (error && (error as any).code !== 2) {
                    // rtk --help might exit with code 2 but still output help
                    this.log(`GetCommands failed: ${error.message}`, 'ERROR');
                    resolve([]);
                    return;
                }
                
                const output = stdout.toString();
                const commands: RTKCommand[] = [];
                const lines = output.split('\n');
                let inCommands = false;

                for (const line of lines) {
                    if (line.trim() === 'Commands:') {
                        inCommands = true;
                        continue;
                    }
                    if (inCommands && (line.trim() === '' || line.startsWith('Options:'))) {
                        inCommands = false;
                        continue;
                    }
                    if (inCommands) {
                        const match = line.trim().match(/^([a-z0-9-]+)\s+(.+)$/i);
                        if (match) {
                            commands.push({
                                name: match[1],
                                description: match[2]
                            });
                        }
                    }
                }
                resolve(commands);
            });
        });
    }

    public async getVersions(): Promise<RTKVersionInfo | null> {
        return new Promise((resolve) => {
            const cmd = this.getCommand('--version');
            cp.exec(cmd, this.getExecOptions(), async (error, stdout) => {
                let current = 'unknown';
                if (!error) {
                    const match = stdout.toString().match(/rtk\s+([0-9.]+)/i);
                    if (match) {current = match[1];}
                }

                try {
                    // Fetch latest from GitHub
                    const response = await fetch('https://api.github.com/repos/rtk-ai/rtk/releases/latest', {
                        headers: { 'User-Agent': 'rtk-inspector-extension' }
                    });
                    if (!response.ok) {throw new Error(`GitHub API error: ${response.statusText}`);}
                    
                    const data = await response.json() as { tag_name: string };
                    const latest = data.tag_name.replace(/^v/, '');
                    
                    const isOutOfDate = this.compareVersions(current, latest) < 0;
                    
                    resolve({ current, latest, isOutOfDate });
                } catch (e) {
                    this.log(`Failed to fetch latest version: ${e}`, 'ERROR');
                    resolve(null);
                }
            });
        });
    }

    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) {return 1;}
            if (p1 < p2) {return -1;}
        }
        return 0;
    }
}
