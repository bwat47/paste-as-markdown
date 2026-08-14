import { describe, expect, test } from 'vitest';
import { PassExecutionError, runPasses } from '../html/passes/runner';
import type { ProcessingPass, PassContext } from '../html/passes/types';
import type { PasteOptions } from '../types';

describe('runPasses', () => {
    const options: PasteOptions = {
        includeImages: true,
        convertImagesToResources: false,
        normalizeQuotes: false,
        forceTightLists: false,
    };
    const context: PassContext = { isGoogleDocs: false };

    test('skips passes whose condition is false and runs the rest', () => {
        const order: string[] = [];
        const passes: ProcessingPass[] = [
            {
                name: 'Skipped pass',
                condition: () => false,
                execute: () => order.push('skipped'),
            },
            {
                name: 'Executed pass',
                execute: () => order.push('executed'),
            },
        ];

        const body = window.document.createElement('div');

        runPasses(passes, body, options, context);

        expect(order).toEqual(['executed']);
    });

    test('wraps a pass error and stops before later passes run', () => {
        const order: string[] = [];
        const cause = new Error('Boom');
        const passes: ProcessingPass[] = [
            {
                name: 'First pass',
                execute: () => {
                    order.push('first');
                },
            },
            {
                name: 'Failing pass',
                execute: () => {
                    throw cause;
                },
            },
            {
                name: 'Final pass',
                execute: () => {
                    order.push('final');
                },
            },
        ];

        const body = window.document.createElement('div');
        let thrown: unknown;
        try {
            runPasses(passes, body, options, context);
        } catch (error) {
            thrown = error;
        }

        expect(order).toEqual(['first']);
        expect(thrown).toBeInstanceOf(PassExecutionError);
        expect(thrown).toMatchObject({
            name: 'PassExecutionError',
            passName: 'Failing pass',
            cause,
            message: 'Failing pass failed: Boom',
        });
    });

    test('wraps errors thrown while evaluating a pass condition', () => {
        const cause = new Error('Condition failed');
        const passes: ProcessingPass[] = [
            {
                name: 'Conditional pass',
                condition: () => {
                    throw cause;
                },
                execute: () => undefined,
            },
        ];
        const body = window.document.createElement('div');
        let thrown: unknown;

        try {
            runPasses(passes, body, options, context);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(PassExecutionError);
        expect(thrown).toMatchObject({ passName: 'Conditional pass', cause });
    });
});
