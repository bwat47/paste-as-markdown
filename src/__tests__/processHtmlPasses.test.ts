import { describe, expect, test, afterEach } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import { POST_IMAGE_PASS_PRIORITY } from '../constants';
import * as passRunner from '../html/passes/runner';
import { getProcessingPasses } from '../html/passes/registry';
import type { ProcessingPass } from '../html/passes/types';
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
        const calledPassLists: ReadonlyArray<ProcessingPass>[] = [];

        const runPassesSpy = jest
            .spyOn(passRunner, 'runPasses')
            .mockImplementation((passes: readonly ProcessingPass[]) => {
                calledPassLists.push(passes);
                return { warnings: [] };
            });

        const html = '<p>Hello <strong>world</strong></p>';
        const result = await processHtml(html, defaultOptions, false);

        expect(result.body).not.toBeNull();
        expect(runPassesSpy).toHaveBeenCalledTimes(2);

        const { preSanitize, postSanitize } = getProcessingPasses();
        const expectedPre = preSanitize;
        const expectedPostPreImage = postSanitize.filter((p) => p.priority < POST_IMAGE_PASS_PRIORITY);

        expect(calledPassLists[0]).toEqual(expectedPre);
        expect(calledPassLists[1]).toEqual(expectedPostPreImage);

        runPassesSpy.mockRestore();
    });
});
