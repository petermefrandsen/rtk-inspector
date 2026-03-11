import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'dist/test/suite/**/*.test.js',
    workspaceFolder: './test-workspace',
    mocha: {
        ui: 'tdd',
        timeout: 20000
    },
    coverage: {
        includeAll: true,
        exclude: [
            'dist/test/**',
            'dist/extension.js'
        ],
        reporter: ['text', 'lcov', 'html', 'cobertura']
    }
});
