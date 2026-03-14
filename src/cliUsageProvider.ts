import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CLIDailyUsage {
    date: string;       // YYYY-MM-DD
    tokens: number;     // total tokens for this CLI on this day
}

export interface CLITotals {
    name: string;       // e.g. 'GitHub Copilot', 'Claude Code'
    total_tokens: number;
    total_tool_calls: number;   // individual tool/command executions
    daily: CLIDailyUsage[];
}

export interface CLIUsage {
    total_tokens: number;           // sum across all CLIs
    total_tool_calls: number;       // sum of tool calls across all CLIs
    by_cli: CLITotals[];
    daily: CLIDailyUsage[];         // combined daily totals across all CLIs
}

export class CLIUsageProvider {

    /**
     * Read token usage from all supported local AI CLIs.
     * Currently supports:
     *  - GitHub Copilot CLI (~/.copilot/session-state)
     *  - Claude Code (~/.claude/projects)
     */
    public getUsage(): CLIUsage {
        const byCli: CLITotals[] = [];

        const copilot = this._readCopilotUsage();
        if (copilot) {byCli.push(copilot);}

        const claudeCode = this._readClaudeCodeUsage();
        if (claudeCode) {byCli.push(claudeCode);}

        const gemini = this._readGeminiUsage();
        if (gemini) {byCli.push(gemini);}

        return this._aggregate(byCli);
    }

    // -------------------------------------------------------------------------
    // GitHub Copilot CLI
    // Reads ~/.copilot/session-state/<uuid>/events.jsonl
    // Sums outputTokens from assistant.message events, grouped by session date.
    // -------------------------------------------------------------------------
    private _readCopilotUsage(): CLITotals | null {
        const sessionsDir = path.join(os.homedir(), '.copilot', 'session-state');
        if (!fs.existsSync(sessionsDir)) {return null;}

        const dailyMap = new Map<string, number>();
        let totalTurns = 0;

        try {
            const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) {continue;}
                const eventsPath = path.join(sessionsDir, entry.name, 'events.jsonl');
                if (!fs.existsSync(eventsPath)) {continue;}

                let sessionDate: string | null = null;
                let sessionTokens = 0;
                let sessionToolCalls = 0;

                const content = fs.readFileSync(eventsPath, 'utf8');
                for (const line of content.split('\n')) {
                    if (!line.trim()) {continue;}
                    try {
                        const ev = JSON.parse(line);
                        if (ev.type === 'session.start' && ev.timestamp) {
                            sessionDate = (ev.timestamp as string).slice(0, 10);
                        } else if (ev.type === 'assistant.message') {
                            const out = ev.data?.outputTokens;
                            if (typeof out === 'number') {
                                sessionTokens += out;
                            }
                        } else if (ev.type === 'tool.execution_complete') {
                            sessionToolCalls++;
                        }
                    } catch {
                        // skip malformed lines
                    }
                }

                if (sessionDate && sessionTokens > 0) {
                    dailyMap.set(sessionDate, (dailyMap.get(sessionDate) ?? 0) + sessionTokens);
                    totalTurns += sessionToolCalls;
                }
            }
        } catch {
            return null;
        }

        if (dailyMap.size === 0) {return null;}

        const daily: CLIDailyUsage[] = Array.from(dailyMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, tokens]) => ({ date, tokens }));

        return {
            name: 'GitHub Copilot',
            total_tokens: daily.reduce((s, d) => s + d.tokens, 0),
            total_tool_calls: totalTurns,
            daily,
        };
    }

    // -------------------------------------------------------------------------
    // Claude Code
    // Reads ~/.claude/projects/<hash>/*.jsonl
    // Sums input_tokens + output_tokens from usage in type=assistant messages.
    // -------------------------------------------------------------------------
    private _readClaudeCodeUsage(): CLITotals | null {
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');
        if (!fs.existsSync(projectsDir)) {return null;}

        const dailyMap = new Map<string, number>();
        let totalTurns = 0;

        try {
            const projects = fs.readdirSync(projectsDir, { withFileTypes: true });
            for (const project of projects) {
                if (!project.isDirectory()) {continue;}
                const projectPath = path.join(projectsDir, project.name);

                for (const file of fs.readdirSync(projectPath)) {
                    if (!file.endsWith('.jsonl')) {continue;}
                    const filePath = path.join(projectPath, file);

                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        for (const line of content.split('\n')) {
                            if (!line.trim()) {continue;}
                            try {
                                const ev = JSON.parse(line);
                                if (ev.type === 'assistant' && ev.message?.usage) {
                                    const usage = ev.message.usage;
                                    const tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
                                    if (tokens > 0 && ev.timestamp) {
                                        const date = (ev.timestamp as string).slice(0, 10);
                                        dailyMap.set(date, (dailyMap.get(date) ?? 0) + tokens);
                                    }
                                    // tool_use blocks in assistant content = tool calls
                                    const toolUses = (ev.message?.content ?? []).filter((b: any) => b.type === 'tool_use');
                                    totalTurns += toolUses.length;
                                }
                            } catch {
                                // skip malformed lines
                            }
                        }
                    } catch {
                        // skip unreadable files
                    }
                }
            }
        } catch {
            return null;
        }

        if (dailyMap.size === 0) {return null;}

        const daily: CLIDailyUsage[] = Array.from(dailyMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, tokens]) => ({ date, tokens }));

        return {
            name: 'Claude Code',
            total_tokens: daily.reduce((s, d) => s + d.tokens, 0),
            total_tool_calls: totalTurns,
            daily,
        };
    }

    // -------------------------------------------------------------------------
    // Gemini CLI
    // Reads ~/.gemini/tmp/<project>/chats/session-*.json
    // Each session has messages array; type='gemini' messages have a
    // tokens: { input, output, cached, thoughts, tool, total } field.
    // We sum the 'total' per message, grouped by session startTime date.
    // -------------------------------------------------------------------------
    private _readGeminiUsage(): CLITotals | null {
        const tmpDir = path.join(os.homedir(), '.gemini', 'tmp');
        if (!fs.existsSync(tmpDir)) {return null;}

        const dailyMap = new Map<string, number>();
        let totalTurns = 0;

        try {
            const projects = fs.readdirSync(tmpDir, { withFileTypes: true });
            for (const project of projects) {
                if (!project.isDirectory()) {continue;}
                const chatsDir = path.join(tmpDir, project.name, 'chats');
                if (!fs.existsSync(chatsDir)) {continue;}

                for (const file of fs.readdirSync(chatsDir)) {
                    if (!file.startsWith('session-') || !file.endsWith('.json')) {continue;}
                    const filePath = path.join(chatsDir, file);

                    try {
                        const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        const sessionDate = (session.startTime as string | undefined)?.slice(0, 10);
                        if (!sessionDate) {continue;}

                        const messages: any[] = session.messages ?? [];
                        for (const msg of messages) {
                            if (msg.type === 'gemini') {
                                // Count tool calls made by the model
                                totalTurns += (msg.toolCalls ?? []).length;
                                const t = msg.tokens;
                                if (!t) {continue;}
                                // Use output + thoughts only — the 'input' field grows cumulatively
                                // each turn (full context re-sent), so summing it inflates by 300x+.
                                const unique = typeof t === 'number'
                                    ? t
                                    : (t.output ?? 0) + (t.thoughts ?? 0);
                                if (unique > 0) {
                                    dailyMap.set(sessionDate, (dailyMap.get(sessionDate) ?? 0) + unique);
                                }
                            }
                        }
                    } catch {
                        // skip unreadable or malformed files
                    }
                }
            }
        } catch {
            return null;
        }

        if (dailyMap.size === 0) {return null;}

        const daily: CLIDailyUsage[] = Array.from(dailyMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, tokens]) => ({ date, tokens }));

        return {
            name: 'Gemini CLI',
            total_tokens: daily.reduce((s, d) => s + d.tokens, 0),
            total_tool_calls: totalTurns,
            daily,
        };
    }

    // -------------------------------------------------------------------------
    // Aggregate multiple CLI sources into a combined total
    // -------------------------------------------------------------------------
    private _aggregate(byCli: CLITotals[]): CLIUsage {
        const combinedMap = new Map<string, number>();
        for (const cli of byCli) {
            for (const d of cli.daily) {
                combinedMap.set(d.date, (combinedMap.get(d.date) ?? 0) + d.tokens);
            }
        }

        const daily: CLIDailyUsage[] = Array.from(combinedMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, tokens]) => ({ date, tokens }));

        return {
            total_tokens: byCli.reduce((s, c) => s + c.total_tokens, 0),
            total_tool_calls: byCli.reduce((s, c) => s + c.total_tool_calls, 0),
            by_cli: byCli,
            daily,
        };
    }
}
