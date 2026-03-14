import * as assert from 'assert';
import proxyquire = require('proxyquire');

suite('RTKProvider Test Suite', () => {
    test('should handle successful RTK output', async () => {
        const mockStats = { summary: { total_saved: 100, avg_savings_pct: 25 } };
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, JSON.stringify(mockStats), '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getStats();
        assert.deepStrictEqual(stats, mockStats);
    });

    test('should return null on command error', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(new Error('CMD_FAILED'), '', 'some error');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getStats();
        assert.strictEqual(stats, null);
    });

    test('should return null on invalid JSON', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'invalid-json', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getStats();
        assert.strictEqual(stats, null);
    });

    test('should handle project stats correctly', async () => {
        const mockStats = { summary: { total_saved: 500, avg_savings_pct: 10 } };
        const mockExec = (cmd: string, options: any, callback: any) => {
            assert.ok(cmd.includes('-p'));
            callback(null, JSON.stringify(mockStats), '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getProjectStats();
        assert.deepStrictEqual(stats, mockStats);
    });

    test('getExecOptions should include common user bin paths on Linux/macOS', () => {
        const { RTKProvider } = require('../../rtkProvider');
        const provider = new RTKProvider();
        
        // Save current platform and HOME
        const originalPlatform = process.platform;
        const originalHome = process.env.HOME;
        
        try {
            // Mock platform to linux
            Object.defineProperty(process, 'platform', { value: 'linux' });
            process.env.HOME = '/home/testuser';
            
            const options = provider.getExecOptions();
            const path = options.env?.PATH || '';
            
            assert.ok(path.includes('/home/testuser/.local/bin'), 'Should include .local/bin');
            assert.ok(path.includes('/home/testuser/bin'), 'Should include ~/bin');
            assert.ok(path.includes('/usr/local/bin'), 'Should include /usr/local/bin');
        } finally {
            // Restore
            Object.defineProperty(process, 'platform', { value: originalPlatform });
            process.env.HOME = originalHome;
        }
    });

    // -----------------------------------------------------------------------
    // getCommands tests
    // -----------------------------------------------------------------------
    test('should parse commands from help output', async () => {
        const helpOutput = `
Usage: rtk [options] [command]

Commands:
  gain          Show token savings
  watch         Watch mode for real-time stats
  config        Configure rtk

Options:
  -h, --help    display help
`;
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, helpOutput, '');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider();
        const commands = await provider.getCommands();

        assert.strictEqual(commands.length, 3);
        assert.strictEqual(commands[0].name, 'gain');
        assert.strictEqual(commands[0].description, 'Show token savings');
        assert.strictEqual(commands[1].name, 'watch');
        assert.strictEqual(commands[2].name, 'config');
    });

    test('should return empty array when exec errors (non-code-2)', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            const err: any = new Error('not found');
            err.code = 127;
            cb(err, '', '');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider();
        const commands = await provider.getCommands();
        assert.deepStrictEqual(commands, []);
    });

    test('should still parse commands when exec exits with code 2', async () => {
        const helpOutput = 'Commands:\n  gain   Show savings\n\nOptions:\n';
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            const err: any = new Error('exit 2');
            err.code = 2;
            cb(err, helpOutput, '');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider();
        const commands = await provider.getCommands();
        assert.strictEqual(commands.length, 1);
        assert.strictEqual(commands[0].name, 'gain');
    });

    test('should return empty array for help output with no Commands section', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'No commands here.', '');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider();
        const commands = await provider.getCommands();
        assert.deepStrictEqual(commands, []);
    });

    // -----------------------------------------------------------------------
    // getVersions tests
    // -----------------------------------------------------------------------
    test('should return version info when rtk and GitHub API succeed', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'rtk 0.28.0', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        // Patch global fetch for the GitHub API call
        const originalFetch = global.fetch;
        (global as any).fetch = async () => ({
            ok: true,
            json: async () => ({ tag_name: 'v0.29.0' }),
        });

        try {
            const provider = new MockedProvider();
            const info = await provider.getVersions();
            assert.ok(info);
            assert.strictEqual(info.current, '0.28.0');
            assert.strictEqual(info.latest, '0.29.0');
            assert.strictEqual(info.isOutOfDate, true);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('should report not out-of-date when current >= latest', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'rtk 1.0.0', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const originalFetch = global.fetch;
        (global as any).fetch = async () => ({
            ok: true,
            json: async () => ({ tag_name: 'v0.29.0' }),
        });

        try {
            const provider = new MockedProvider();
            const info = await provider.getVersions();
            assert.ok(info);
            assert.strictEqual(info.isOutOfDate, false);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('should return null when GitHub API returns non-ok response', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'rtk 0.28.0', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const originalFetch = global.fetch;
        (global as any).fetch = async () => ({
            ok: false,
            statusText: 'Rate Limited',
        });

        try {
            const provider = new MockedProvider();
            const info = await provider.getVersions();
            assert.strictEqual(info, null);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('should return null when GitHub API fetch throws', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'rtk 0.28.0', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const originalFetch = global.fetch;
        (global as any).fetch = async () => { throw new Error('network error'); };

        try {
            const provider = new MockedProvider();
            const info = await provider.getVersions();
            assert.strictEqual(info, null);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('should use "unknown" version when rtk --version fails', async () => {
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(new Error('not found'), '', '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const originalFetch = global.fetch;
        (global as any).fetch = async () => ({
            ok: true,
            json: async () => ({ tag_name: 'v0.29.0' }),
        });

        try {
            const provider = new MockedProvider();
            const info = await provider.getVersions();
            assert.ok(info);
            assert.strictEqual(info.current, 'unknown');
            assert.strictEqual(info.isOutOfDate, true);
        } finally {
            global.fetch = originalFetch;
        }
    });

    // -----------------------------------------------------------------------
    // RTKProvider with output channel (log coverage)
    // -----------------------------------------------------------------------
    test('should log messages to outputChannel when provided', async () => {
        const logged: string[] = [];
        const mockOutputChannel = { appendLine: (msg: string) => logged.push(msg) };
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(new Error('cmd failed'), '', 'stderr text');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider(mockOutputChannel);
        await provider.getStats();

        assert.ok(logged.some(l => l.includes('ERROR')));
        assert.ok(logged.some(l => l.includes('cmd failed')));
    });

    test('should log stderr in getProjectStats when command fails', async () => {
        const logged: string[] = [];
        const mockOutputChannel = { appendLine: (msg: string) => logged.push(msg) };
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(new Error('project error'), '', 'project stderr');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider(mockOutputChannel);
        const result = await provider.getProjectStats();
        assert.strictEqual(result, null);
        assert.ok(logged.some(l => l.includes('project stderr')));
    });

    test('should log JSON parse error for getProjectStats', async () => {
        const logged: string[] = [];
        const mockOutputChannel = { appendLine: (msg: string) => logged.push(msg) };
        const mockExec = (cmd: string, options: any, callback?: any) => {
            const cb = typeof options === 'function' ? options : callback;
            cb(null, 'not-json', '');
        };
        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });
        const provider = new MockedProvider(mockOutputChannel);
        const result = await provider.getProjectStats();
        assert.strictEqual(result, null);
        assert.ok(logged.some(l => l.includes('ERROR') || l.includes('Parse')));
    });
});

