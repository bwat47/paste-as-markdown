import { describe, expect, test } from '@jest/globals';
import { getProcessingPasses, __TEST__ } from '../html/passes/registry';
import type { ProcessingPass } from '../html/passes/types';

describe('passes registry', () => {
    test('returns pre/post passes sorted by ascending priority', () => {
        const { preSanitize, postSanitize } = getProcessingPasses();
        const isSorted = (passes: ProcessingPass[]): boolean => {
            return passes.every((pass, index, arr) => index === 0 || pass.priority >= arr[index - 1].priority);
        };

        expect(isSorted(preSanitize)).toBe(true);
        expect(isSorted(postSanitize)).toBe(true);
    });

    test('validatePriorities allows unique priorities', () => {
        const passes: ProcessingPass[] = [
            {
                name: 'First',
                phase: 'pre-sanitize',
                priority: 10,
                execute: () => undefined,
            },
            {
                name: 'Second',
                phase: 'pre-sanitize',
                priority: 20,
                execute: () => undefined,
            },
        ];

        expect(() => __TEST__.validatePriorities(passes)).not.toThrow();
    });

    test('validatePriorities throws on duplicate priorities', () => {
        const passes: ProcessingPass[] = [
            {
                name: 'Duplicate A',
                phase: 'pre-sanitize',
                priority: 10,
                execute: () => undefined,
            },
            {
                name: 'Duplicate B',
                phase: 'pre-sanitize',
                priority: 10,
                execute: () => undefined,
            },
        ];

        expect(() => __TEST__.validatePriorities(passes)).toThrow(/Duplicate priority/);
    });

    test('sortPasses orders passes by priority', () => {
        const unordered: ProcessingPass[] = [
            {
                name: 'Third',
                phase: 'pre-sanitize',
                priority: 30,
                execute: () => undefined,
            },
            {
                name: 'First',
                phase: 'pre-sanitize',
                priority: 10,
                execute: () => undefined,
            },
            {
                name: 'Second',
                phase: 'pre-sanitize',
                priority: 20,
                execute: () => undefined,
            },
        ];

        const ordered = __TEST__.sortPasses(unordered);
        expect(ordered.map((pass) => pass.name)).toEqual(['First', 'Second', 'Third']);
    });
});
