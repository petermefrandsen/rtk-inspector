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
    constructor(private readonly _outputChannel?: vscode.LogOutputChannel) {}

    public async getStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            this._outputChannel?.info('Fetching RTK stats: rtk gain -d -f json');
            cp.exec('rtk gain -d -f json', (error, stdout, stderr) => {
                if (error) {
                    this._outputChannel?.error(`Command failed: ${error.message}`);
                    if (stderr) {this._outputChannel?.error(`Stderr: ${stderr}`);}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    this._outputChannel?.error(`Failed to parse JSON: ${e}`);
                    this._outputChannel?.debug(`Raw Output: ${stdout}`);
                    resolve(null);
                }
            });
        });
    }

    public async getProjectStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            this._outputChannel?.info('Fetching RTK project stats: rtk gain -p -f json');
            cp.exec('rtk gain -p -f json', (error, stdout, stderr) => {
                if (error) {
                    this._outputChannel?.error(`Project Command failed: ${error.message}`);
                    if (stderr) {this._outputChannel?.error(`Project Stderr: ${stderr}`);}
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    this._outputChannel?.error(`Project JSON Parse Error: ${e}`);
                    this._outputChannel?.debug(`Project Raw Output: ${stdout}`);
                    resolve(null);
                }
            });
        });
    }
}
