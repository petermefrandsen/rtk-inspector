import * as cp from 'child_process';

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
    public async getStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            cp.exec('rtk gain -d -f json', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    console.error(`Failed to parse JSON: ${e}`);
                    resolve(null);
                }
            });
        });
    }

    public async getProjectStats(): Promise<RTKStats | null> {
        return new Promise((resolve) => {
            cp.exec('rtk gain -p -f json', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    resolve(null);
                    return;
                }
                try {
                    const stats = JSON.parse(stdout) as RTKStats;
                    resolve(stats);
                } catch (e) {
                    console.error(`Failed to parse JSON: ${e}`);
                    resolve(null);
                }
            });
        });
    }
}
