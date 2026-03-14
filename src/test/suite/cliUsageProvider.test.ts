import * as assert from 'assert';
import proxyquire = require('proxyquire');

// -------------------------------------------------------------------------
// Helpers to build realistic mock fs / os / path modules
// -------------------------------------------------------------------------

/** Minimal Dirent-like object */
function dir(name: string) {
    return { name, isDirectory: () => true };
}
function file(name: string) {
    return { name, isDirectory: () => false };
}

const HOME = '/home/testuser';

function buildMocks(fsCfg: {
    existsMap: Record<string, boolean>,
    readdirMap: Record<string, any[]>,
    fileMap: Record<string, string>,
}) {
    const mockOs = { homedir: () => HOME };

    const mockFs = {
        existsSync: (p: string) => fsCfg.existsMap[p] ?? false,
        readdirSync: (p: string, _opts?: any) => {
            if (!(p in fsCfg.readdirMap)) {throw new Error(`readdirSync: unexpected path ${p}`);}
            return fsCfg.readdirMap[p];
        },
        readFileSync: (p: string, _enc: string) => {
            if (!(p in fsCfg.fileMap)) {throw new Error(`readFileSync: unexpected path ${p}`);}
            return fsCfg.fileMap[p];
        },
    };

    return { mockOs, mockFs };
}

function loadProvider(mockFs: any, mockOs: any) {
    const { CLIUsageProvider } = proxyquire('../../cliUsageProvider', {
        fs: mockFs,
        os: mockOs,
    });
    return new CLIUsageProvider();
}

// =========================================================================
suite('CLIUsageProvider Test Suite', () => {

    // -----------------------------------------------------------------------
    suite('getUsage – no CLIs present', () => {
        test('should return zero totals when no CLI data directories exist', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap: {},
                readdirMap: {},
                fileMap: {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            assert.strictEqual(usage.total_tokens, 0);
            assert.strictEqual(usage.total_tool_calls, 0);
            assert.deepStrictEqual(usage.by_cli, []);
            assert.deepStrictEqual(usage.daily, []);
        });
    });

    // -----------------------------------------------------------------------
    suite('GitHub Copilot reader', () => {
        const sessionsDir = `${HOME}/.copilot/session-state`;
        const sessionDir  = `${sessionsDir}/uuid1`;
        const eventsPath  = `${sessionDir}/events.jsonl`;

        const sessionStart   = JSON.stringify({ type: 'session.start',         timestamp: '2024-06-01T10:00:00Z' });
        const assistantMsg   = JSON.stringify({ type: 'assistant.message',     data: { outputTokens: 500 } });
        const assistantMsg2  = JSON.stringify({ type: 'assistant.message',     data: { outputTokens: 300 } });
        const toolExec       = JSON.stringify({ type: 'tool.execution_complete' });
        const irrelevantLine = JSON.stringify({ type: 'some.other.event' });
        const malformedLine  = '{ NOT VALID JSON :::';

        test('should parse tokens and tool calls from a single session', () => {
            const content = [sessionStart, assistantMsg, assistantMsg2, toolExec, toolExec, irrelevantLine, malformedLine, ''].join('\n');

            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true, [eventsPath]: true },
                readdirMap: { [sessionsDir]: [dir('uuid1')] },
                fileMap:    { [eventsPath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            assert.strictEqual(usage.by_cli.length, 1);
            const copilot = usage.by_cli[0];
            assert.strictEqual(copilot.name, 'GitHub Copilot');
            assert.strictEqual(copilot.total_tokens, 800);
            assert.strictEqual(copilot.total_tool_calls, 2);
            assert.strictEqual(copilot.daily.length, 1);
            assert.strictEqual(copilot.daily[0].date, '2024-06-01');
            assert.strictEqual(copilot.daily[0].tokens, 800);
        });

        test('should aggregate multiple sessions on the same date', () => {
            const s2Dir   = `${sessionsDir}/uuid2`;
            const s2Path  = `${s2Dir}/events.jsonl`;
            const content2 = [
                JSON.stringify({ type: 'session.start',     timestamp: '2024-06-01T12:00:00Z' }),
                JSON.stringify({ type: 'assistant.message', data: { outputTokens: 200 } }),
            ].join('\n');
            const content1 = [sessionStart, assistantMsg, ''].join('\n');

            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true, [eventsPath]: true, [s2Path]: true },
                readdirMap: { [sessionsDir]: [dir('uuid1'), dir('uuid2')] },
                fileMap:    { [eventsPath]: content1, [s2Path]: content2 },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            const copilot = usage.by_cli[0];
            assert.strictEqual(copilot.total_tokens, 700);
            assert.strictEqual(copilot.daily[0].tokens, 700);
        });

        test('should return null (and omit from by_cli) when sessionsDir missing', () => {
            const { mockFs, mockOs } = buildMocks({ existsMap: {}, readdirMap: {}, fileMap: {} });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });

        test('should skip sessions with no events.jsonl file', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true },   // eventsPath NOT present
                readdirMap: { [sessionsDir]: [dir('uuid1')] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });

        test('should skip sessions without session.start timestamp', () => {
            const content = [assistantMsg, toolExec].join('\n');
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true, [eventsPath]: true },
                readdirMap: { [sessionsDir]: [dir('uuid1')] },
                fileMap:    { [eventsPath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });

        test('should skip non-directory entries in sessionsDir', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true },
                readdirMap: { [sessionsDir]: [file('not-a-dir.txt')] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });

        test('should return null when readdirSync throws', () => {
            const mockOs = { homedir: () => HOME };
            const mockFs = {
                existsSync: (p: string) => p === sessionsDir,
                readdirSync: () => { throw new Error('permission denied'); },
                readFileSync: () => '',
            };
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });

        test('should ignore assistant.message events with non-numeric outputTokens', () => {
            const content = [
                sessionStart,
                JSON.stringify({ type: 'assistant.message', data: { outputTokens: 'not-a-number' } }),
                JSON.stringify({ type: 'assistant.message', data: {} }),  // missing outputTokens
            ].join('\n');
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [sessionsDir]: true, [eventsPath]: true },
                readdirMap: { [sessionsDir]: [dir('uuid1')] },
                fileMap:    { [eventsPath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'GitHub Copilot'));
        });
    });

    // -----------------------------------------------------------------------
    suite('Claude Code reader', () => {
        const projectsDir = `${HOME}/.claude/projects`;
        const projDir     = `${projectsDir}/proj1`;
        const filePath    = `${projDir}/session.jsonl`;

        function assistantLine(inputTokens: number, outputTokens: number, toolUses: number, date: string) {
            return JSON.stringify({
                type: 'assistant',
                timestamp: `${date}T10:00:00Z`,
                message: {
                    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                    content: Array.from({ length: toolUses }, () => ({ type: 'tool_use' })),
                },
            });
        }

        test('should parse tokens and tool_use blocks from assistant messages', () => {
            const content = [
                assistantLine(100, 50, 2, '2024-06-01'),
                assistantLine(200, 80, 1, '2024-06-01'),
                '{ BAD JSON',
                '',
            ].join('\n');

            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [projectsDir]: true },
                readdirMap: { [projectsDir]: [dir('proj1')], [projDir]: ['session.jsonl'] },
                fileMap:    { [filePath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            const claude = usage.by_cli.find((c: any) => c.name === 'Claude Code');
            assert.ok(claude);
            assert.strictEqual(claude.total_tokens, 430);
            assert.strictEqual(claude.total_tool_calls, 3);
            assert.strictEqual(claude.daily[0].date, '2024-06-01');
        });

        test('should return null when projectsDir missing', () => {
            const { mockFs, mockOs } = buildMocks({ existsMap: {}, readdirMap: {}, fileMap: {} });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Claude Code'));
        });

        test('should skip non-jsonl files', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [projectsDir]: true },
                readdirMap: { [projectsDir]: [dir('proj1')], [projDir]: ['session.txt', 'session.json'] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Claude Code'));
        });

        test('should skip non-directory project entries', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [projectsDir]: true },
                readdirMap: { [projectsDir]: [file('somefile.txt')] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Claude Code'));
        });

        test('should skip assistant messages with zero tokens', () => {
            const content = assistantLine(0, 0, 0, '2024-06-01') + '\n';
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [projectsDir]: true },
                readdirMap: { [projectsDir]: [dir('proj1')], [projDir]: ['session.jsonl'] },
                fileMap:    { [filePath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Claude Code'));
        });

        test('should handle content array with non-tool_use blocks', () => {
            const content = JSON.stringify({
                type: 'assistant',
                timestamp: '2024-06-01T10:00:00Z',
                message: {
                    usage: { input_tokens: 100, output_tokens: 50 },
                    content: [{ type: 'text' }, { type: 'tool_use' }],
                },
            }) + '\n';
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [projectsDir]: true },
                readdirMap: { [projectsDir]: [dir('proj1')], [projDir]: ['session.jsonl'] },
                fileMap:    { [filePath]: content },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            const claude = usage.by_cli.find((c: any) => c.name === 'Claude Code');
            assert.ok(claude);
            assert.strictEqual(claude.total_tool_calls, 1);
        });

        test('should return null when readdirSync throws', () => {
            const mockOs = { homedir: () => HOME };
            const mockFs = {
                existsSync: (p: string) => p === projectsDir,
                readdirSync: () => { throw new Error('permission denied'); },
                readFileSync: () => '',
            };
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Claude Code'));
        });
    });

    // -----------------------------------------------------------------------
    suite('Gemini CLI reader', () => {
        const tmpDir    = `${HOME}/.gemini/tmp`;
        const projDir   = `${tmpDir}/project1`;
        const chatsDir  = `${projDir}/chats`;
        const sessionFile = `${chatsDir}/session-abc.json`;

        function makeSession(messages: any[]) {
            return JSON.stringify({ startTime: '2024-06-05T08:00:00Z', messages });
        }

        test('should parse output+thoughts tokens and toolCalls from gemini messages', () => {
            const session = makeSession([
                { type: 'user', content: 'hello' },
                { type: 'gemini', tokens: { input: 999, output: 300, thoughts: 50, cached: 0 }, toolCalls: ['tc1', 'tc2'] },
                { type: 'gemini', tokens: { input: 1200, output: 200, thoughts: 10 }, toolCalls: [] },
            ]);

            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['session-abc.json'] },
                fileMap:    { [sessionFile]: session },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            const gemini = usage.by_cli.find((c: any) => c.name === 'Gemini CLI');
            assert.ok(gemini);
            // output+thoughts only: (300+50) + (200+10) = 560
            assert.strictEqual(gemini.total_tokens, 560);
            assert.strictEqual(gemini.total_tool_calls, 2);
            assert.strictEqual(gemini.daily[0].date, '2024-06-05');
        });

        test('should handle tokens as a plain number', () => {
            const session = makeSession([
                { type: 'gemini', tokens: 400, toolCalls: ['t1'] },
            ]);
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['session-abc.json'] },
                fileMap:    { [sessionFile]: session },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            const gemini = usage.by_cli.find((c: any) => c.name === 'Gemini CLI');
            assert.ok(gemini);
            assert.strictEqual(gemini.total_tokens, 400);
            assert.strictEqual(gemini.total_tool_calls, 1);
        });

        test('should return null when tmpDir missing', () => {
            const { mockFs, mockOs } = buildMocks({ existsMap: {}, readdirMap: {}, fileMap: {} });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip sessions without startTime', () => {
            const session = JSON.stringify({ messages: [{ type: 'gemini', tokens: 100, toolCalls: [] }] });
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['session-abc.json'] },
                fileMap:    { [sessionFile]: session },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip files not matching session-*.json pattern', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['other.json', 'session-abc.txt'] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip projects without chats directory', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true },  // chatsDir NOT present
                readdirMap: { [tmpDir]: [dir('project1')] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip malformed session JSON files gracefully', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['session-bad.json'] },
                fileMap:    { [`${chatsDir}/session-bad.json`]: '{ NOT VALID' },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip gemini messages with no tokens', () => {
            const session = makeSession([{ type: 'gemini', toolCalls: [] }]);
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true, [chatsDir]: true },
                readdirMap: { [tmpDir]: [dir('project1')], [chatsDir]: ['session-abc.json'] },
                fileMap:    { [sessionFile]: session },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should skip non-directory project entries', () => {
            const { mockFs, mockOs } = buildMocks({
                existsMap:  { [tmpDir]: true },
                readdirMap: { [tmpDir]: [file('file.txt')] },
                fileMap:    {},
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });

        test('should return null when readdirSync throws for tmpDir', () => {
            const mockOs = { homedir: () => HOME };
            const mockFs = {
                existsSync: (p: string) => p === tmpDir,
                readdirSync: () => { throw new Error('permission denied'); },
                readFileSync: () => '',
            };
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            assert.ok(!usage.by_cli.find((c: any) => c.name === 'Gemini CLI'));
        });
    });

    // -----------------------------------------------------------------------
    suite('aggregate / combined output', () => {
        test('should combine daily data from multiple CLIs', () => {
            // Copilot on 2024-06-01, Gemini on 2024-06-01 and 2024-06-02
            const copilotSessionsDir = `${HOME}/.copilot/session-state`;
            const copilotEventsPath  = `${copilotSessionsDir}/s1/events.jsonl`;
            const copilotContent = [
                JSON.stringify({ type: 'session.start',     timestamp: '2024-06-01T08:00:00Z' }),
                JSON.stringify({ type: 'assistant.message', data: { outputTokens: 100 } }),
            ].join('\n');

            const geminiTmpDir    = `${HOME}/.gemini/tmp`;
            const geminiChatsDir  = `${geminiTmpDir}/proj/chats`;
            const geminiSession1  = `${geminiChatsDir}/session-1.json`;
            const geminiSession2  = `${geminiChatsDir}/session-2.json`;

            const { mockFs, mockOs } = buildMocks({
                existsMap: {
                    [copilotSessionsDir]: true,
                    [copilotEventsPath]: true,
                    [geminiTmpDir]: true,
                    [geminiChatsDir]: true,
                },
                readdirMap: {
                    [copilotSessionsDir]: [dir('s1')],
                    [geminiTmpDir]: [dir('proj')],
                    [geminiChatsDir]: ['session-1.json', 'session-2.json'],
                },
                fileMap: {
                    [copilotEventsPath]: copilotContent,
                    [geminiSession1]: JSON.stringify({ startTime: '2024-06-01T09:00:00Z', messages: [{ type: 'gemini', tokens: { output: 200, thoughts: 0 }, toolCalls: [] }] }),
                    [geminiSession2]: JSON.stringify({ startTime: '2024-06-02T09:00:00Z', messages: [{ type: 'gemini', tokens: { output: 150, thoughts: 0 }, toolCalls: ['t1'] }] }),
                },
            });

            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();

            assert.strictEqual(usage.by_cli.length, 2);
            assert.strictEqual(usage.total_tokens, 100 + 200 + 150);
            assert.strictEqual(usage.total_tool_calls, 1);

            // Combined daily: 2024-06-01 = 100+200=300, 2024-06-02 = 150
            const dayMap = new Map(usage.daily.map((d: any) => [d.date, d.tokens]));
            assert.strictEqual(dayMap.get('2024-06-01'), 300);
            assert.strictEqual(dayMap.get('2024-06-02'), 150);
        });

        test('should return sorted daily entries across multiple CLIs', () => {
            const tmpDir = `${HOME}/.gemini/tmp`;
            const chatsDir = `${tmpDir}/proj/chats`;
            const { mockFs, mockOs } = buildMocks({
                existsMap: { [tmpDir]: true, [chatsDir]: true },
                readdirMap: {
                    [tmpDir]: [dir('proj')],
                    [chatsDir]: ['session-b.json', 'session-a.json'],
                },
                fileMap: {
                    [`${chatsDir}/session-b.json`]: JSON.stringify({ startTime: '2024-06-03T00:00:00Z', messages: [{ type: 'gemini', tokens: { output: 10, thoughts: 0 }, toolCalls: [] }] }),
                    [`${chatsDir}/session-a.json`]: JSON.stringify({ startTime: '2024-06-01T00:00:00Z', messages: [{ type: 'gemini', tokens: { output: 10, thoughts: 0 }, toolCalls: [] }] }),
                },
            });
            const provider = loadProvider(mockFs, mockOs);
            const usage = provider.getUsage();
            const dates = usage.daily.map((d: any) => d.date);
            assert.deepStrictEqual(dates, ['2024-06-01', '2024-06-03']);
        });
    });
});
