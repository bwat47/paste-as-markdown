// Flat config (ESM). Adds ignores, Node globals, and TS-friendly rule tweaks.

import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import sonarjs from 'eslint-plugin-sonarjs';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig([
    {
        ignores: ['api/**', 'dist/**', 'webpack.config.js', '.prettierrc.js', 'scripts/updateHighlightLanguages.js'],
    },

    js.configs.recommended,
    sonarjs.configs.recommended,
    // Registers the TS parser/plugin for all files and disables core rules TypeScript handles in .ts files.
    tseslint.configs.recommended,

    // Project TS/JS sources
    {
        files: ['**/*.{ts,tsx,js,mjs,cjs}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            'import-x': importPlugin,
        },
        settings: {
            // Without these, import-x silently skips TS imports and rules like no-cycle never fire.
            // Resolve imports the way tsc does (.ts extensions, tsconfig paths)...
            'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
            // ...and parse resolved .ts files when following the import graph.
            'import-x/extensions': ['.ts', '.tsx', '.js'],
            'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
        },
        rules: {
            'no-useless-escape': 'off',
            // report an error if any circular dependency is found
            'import-x/no-cycle': ['error', { maxDepth: Infinity }],
            'import-x/no-self-import': 'error',
            // Merge duplicate imports using inline `type` specifiers, matching consistent-type-imports below
            'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
            '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
            // Use `import type { A }` rather than `import { type A }` when every specifier is a type
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'error',
        },
    },

    // Node scripts are CommonJS.
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },

    // Type-aware checks for TypeScript sources; JS tooling keeps untyped linting.
    {
        files: ['**/*.{ts,tsx}'],
        extends: [tseslint.configs.recommendedTypeCheckedOnly],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    // Vitest checks for tests and helpers, including assertion-aware method references.
    {
        files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
        extends: [vitest.configs.recommended],
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            'vitest/unbound-method': 'error',
            // Asymmetric matchers such as expect.stringMatching() are typed `any`.
            '@typescript-eslint/no-unsafe-assignment': 'off',
        },
    },

    // Prettier compatibility
    prettier,
]);
