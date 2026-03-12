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

export class RTKProvider {
    constructor(private readonly _outputChannel?: vscode.OutputChannel) {}

    private log(message: string, type: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
        const timestamp = new Date().toISOString();
        this._outputChannel?.appendLine(`[${timestamp}] [${type}] ${message}`);
    }

    public async getStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            this.log('Fetching RTK stats: rtk gain -d -f json');
            cp.exec('rtk gain -d -f json', (error, stdout, stderr) => {
                if (error) {
                    this.log(`Command failed: ${error.message}`, 'ERROR');
                    if (stderr) {this.log(`Stderr: ${stderr}`, 'ERROR');}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
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
            this.log('Fetching RTK project stats: rtk gain -p -f json');
            cp.exec('rtk gain -p -f json', (error, stdout, stderr) => {
                if (error) {
                    this.log(`Project Command failed: ${error.message}`, 'ERROR');
                    if (stderr) {this.log(`Project Stderr: ${stderr}`, 'ERROR');}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    this.log(`Project JSON Parse Error: ${e}`, 'ERROR');
                    this.log(`Project Raw Output: ${stdout}`, 'DEBUG');
                    resolve(null);
                }
            });
        });
    }
}
