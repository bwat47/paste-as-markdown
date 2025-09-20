import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { runPasses } from '../html/passes/runner';
import type { ProcessingPass, PassContext } from '../html/passes/types';
import { LOG_PREFIX } from '../constants';
import type { PasteOptions } from '../types';

describe('runPasses', () => {
    const options: PasteOptions = {
        includeImages: true,
        convertImagesToResources: false,
        normalizeQuotes: false,
        forceTightLists: false,
    };
    const context: PassContext = { isGoogleDocs: false };

    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    test('collects warnings when a pass throws and continues with remaining passes', () => {
        const order: string[] = [];
        const passes: ProcessingPass[] = [
            {
                name: 'First pass',
                phase: 'pre-sanitize',
                priority: 10,
                execute: () => {
                    order.push('first');
                },
            },
            {
                name: 'Failing pass',
                phase: 'pre-sanitize',
                priority: 20,
                execute: () => {
                    throw new Error('Boom');
                },
            },
            {
                name: 'Final pass',
                phase: 'pre-sanitize',
                priority: 30,
                execute: () => {
                    order.push('final');
                },
            },
        ];

        const body = window.document.createElement('div');
        const result = runPasses(passes, body, options, context);

        expect(order).toEqual(['first', 'final']);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('Failing pass');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const [prefix, message] = warnSpy.mock.calls[0];
        expect(prefix).toBe(LOG_PREFIX);
        expect(message).toBe('Failing pass failed:');
    });
});
