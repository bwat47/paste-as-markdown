module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts', // Skip main plugin file
        '!src/**/*.d.ts',
        '!src/__tests__/**/__mocks__/**',
        '!src/__tests__/setup.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    moduleNameMapper: {
        '^api$': '<rootDir>/src/__tests__/__mocks__/api.ts',
        '^api/(.*)$': '<rootDir>/src/__tests__/__mocks__/api/$1.ts',
        '^../gfmPlugin$': '<rootDir>/src/__tests__/__mocks__/gfmPlugin.ts',
        '^./gfmPlugin$': '<rootDir>/src/__tests__/__mocks__/gfmPlugin.ts',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
};