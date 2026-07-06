import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: [
            { find: /^api$/, replacement: path.resolve(__dirname, 'src/__tests__/__mocks__/api.ts') },
            {
                find: /^api\/(.*)$/,
                replacement: path.resolve(__dirname, 'src/__tests__/__mocks__/api/$1.ts'),
            },
            {
                find: '@bwat47/turndown-plugin-gfm',
                replacement: path.resolve(__dirname, 'src/__tests__/__mocks__/turndownPluginGfm.ts'),
            },
        ],
    },
    test: {
        environment: 'jsdom',
        root: '.',
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        setupFiles: ['./src/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            reportsDirectory: 'coverage',
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/**/*.d.ts', 'src/__tests__/__mocks__/**', 'src/__tests__/setup.ts'],
        },
    },
});
