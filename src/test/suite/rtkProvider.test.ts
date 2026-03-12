import * as assert from 'assert';
import { RTKProvider } from '../../rtkProvider';

suite('RTKProvider Test Suite', () => {
    test('should instantiate RTKProvider', () => {
        const provider = new RTKProvider();
        assert.ok(provider);
    });

    test('should define getStats', () => {
        const provider = new RTKProvider();
        assert.strictEqual(typeof provider.getStats, 'function');
    });

    test('should define getProjectStats', () => {
        const provider = new RTKProvider();
        assert.strictEqual(typeof provider.getProjectStats, 'function');
    });
});
