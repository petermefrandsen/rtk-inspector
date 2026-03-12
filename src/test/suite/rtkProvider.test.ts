import * as assert from 'assert';
import proxyquire = require('proxyquire');

suite('RTKProvider Test Suite', () => {
    test('should handle successful RTK output', async () => {
        const mockStats = { summary: { total_saved: 100, avg_savings_pct: 25 } };
        const mockExec = (cmd: string, callback: any) => {
            callback(null, JSON.stringify(mockStats), '');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getStats();
        assert.deepStrictEqual(stats, mockStats);
    });

    test('should return null on command error', async () => {
        const mockExec = (cmd: string, callback: any) => {
            callback(new Error('CMD_FAILED'), '', 'some error');
        };

        const { RTKProvider: MockedProvider } = proxyquire('../../rtkProvider', {
            'child_process': { exec: mockExec }
        });

        const provider = new MockedProvider();
        const stats = await provider.getStats();
        assert.strictEqual(stats, null);
    });

    test('should return null on invalid JSON', async () => {
        const mockExec = (cmd: string, callback: any) => {
            callback(null, 'invalid-json', '');
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
});
