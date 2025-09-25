import { describe, expect, test, afterEach } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import * as passRunner from '../html/passes/runner';
import type { PasteOptions } from '../types';

const defaultOptions: PasteOptions = {
    includeImages: false,
    convertImagesToResources: false,
    normalizeQuotes: false,
    forceTightLists: false,
};

afterEach(() => {
    jest.restoreAllMocks();
});

describe('processHtml pass orchestration', () => {
    test('runs pre- and post-sanitize passes in priority order', async () => {
        const executionLog: string[][] = [];

        const runPassesSpy = jest
            .spyOn(passRunner, 'runPasses')
            .mockImplementation((passes, _body, options, context) => {
                const executed: string[] = [];
                passes.forEach((pass) => {
                    if (!pass.condition || pass.condition(options, context)) {
                        executed.push(pass.name);
                    }
                });
                executionLog.push(executed);
                return { warnings: [] };
            });

        const html = '<p>Hello <strong>world</strong></p>';
        const result = await processHtml(html, defaultOptions, false);

        expect(result.body).not.toBeNull();
        expect(runPassesSpy).toHaveBeenCalledTimes(2);
        expect(executionLog[0]).toEqual([
            'Pre-sanitize text normalization',
            'Pre-sanitize non-content UI removal',
            'Unwrap redundant bolding in headings',
            'Image sizing promotion',
            'Image anchor cleanup',
            'Code block neutralization',
        ]);
        expect(executionLog[1]).toEqual([
            'Post-sanitize empty anchor removal',
            'Post-sanitize heading anchor cleanup',
            'Post-sanitize orphaned sub-list fix',
            'Post-sanitize text normalization',
            'Literal HTML tag protection',
            'Code block normalization',
            'NBSP inline code sentinel marking',
            'Image alt normalization (pre-conversion)',
        ]);

        runPassesSpy.mockRestore();
    });
});
