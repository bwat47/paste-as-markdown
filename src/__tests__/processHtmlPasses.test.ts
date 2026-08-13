import { describe, expect, test, afterEach, vi } from 'vitest';
import { processHtml } from '../html/processHtml';
import * as passRunner from '../html/passes/runner';
import { PROCESSING_PASSES } from '../html/passes/registry';
import type { ProcessingPass } from '../html/passes/types';
import type { PasteOptions } from '../types';

const defaultOptions: PasteOptions = {
    includeImages: false,
    convertImagesToResources: false,
    normalizeQuotes: false,
    forceTightLists: false,
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('processHtml pass orchestration', () => {
    test('runs each explicit pass phase in pipeline order', async () => {
        const calledPassLists: ReadonlyArray<ProcessingPass>[] = [];

        const runPassesSpy = vi
            .spyOn(passRunner, 'runPasses')
            .mockImplementation((passes: readonly ProcessingPass[]) => {
                calledPassLists.push(passes);
                return { warnings: [] };
            });

        const html = '<p>Hello <strong>world</strong></p>';
        const result = await processHtml(html, defaultOptions, false);

        expect(result.body).not.toBeNull();
        expect(runPassesSpy).toHaveBeenCalledTimes(3);
        expect(calledPassLists).toEqual([
            PROCESSING_PASSES.preSanitize,
            PROCESSING_PASSES.postSanitize,
            PROCESSING_PASSES.postImage,
        ]);

        runPassesSpy.mockRestore();
    });
});
