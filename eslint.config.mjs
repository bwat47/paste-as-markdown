// Flat config (ESM). Adds ignores, Node globals, and TS-friendly rule tweaks.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: ['api/**', 'dist/**'],
    },

    js.configs.recommended,
    sonarjs.configs.recommended,

    // Project TS/JS sources
    {
        files: ['**/*.{ts,tsx,js,mjs,cjs}'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            import: importPlugin,
        },
        rules: {
            // Turn off rules TypeScript handles (prevents NodeJS / type-only false positives)
            'no-undef': 'off',
            'no-useless-escape': 'off',
            ...tsPlugin.configs.recommended.rules,
            // report an error if any circular dependency is found
            'import/no-cycle': ['error', { maxDepth: Infinity }],
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
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...tsPlugin.configs['recommended-type-checked'].rules,
        },
    },

    // Vitest checks for tests and helpers, including assertion-aware method references.
    {
        files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
        plugins: {
            vitest,
        },
        rules: {
            ...vitest.configs.recommended.rules,
            '@typescript-eslint/unbound-method': 'off',
            'vitest/unbound-method': 'error',
            // Asymmetric matchers such as expect.stringMatching() are typed `any`.
            '@typescript-eslint/no-unsafe-assignment': 'off',
        },
    },

    // Prettier compatibility
    prettier,
];
