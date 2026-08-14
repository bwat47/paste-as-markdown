import { describe, expect, test, afterEach, vi } from 'vitest';
import { HtmlProcessingError, processHtml } from '../html/processHtml';
import * as passRunner from '../html/passes/runner';
import { PassExecutionError } from '../html/passes/runner';
import { PROCESSING_PASSES } from '../html/passes/registry';
import * as resourceConverter from '../resourceConverter';
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

    test.each([
        { phase: 'pre-sanitize', failingCall: 1 },
        { phase: 'post-sanitize', failingCall: 2 },
        { phase: 'post-image', failingCall: 3 },
    ])('turns a $phase pass error into a fatal HTML processing error', async ({ phase, failingCall }) => {
        const cause = new Error(`${phase} failed`);
        const passError = new PassExecutionError(`${phase} test pass`, cause);
        let callCount = 0;
        const runPassesSpy = vi.spyOn(passRunner, 'runPasses').mockImplementation(() => {
            callCount++;
            if (callCount === failingCall) throw passError;
        });

        let thrown: unknown;
        try {
            await processHtml('<p>Content</p>', defaultOptions, false);
        } catch (error) {
            thrown = error;
        }

        expect(runPassesSpy).toHaveBeenCalledTimes(failingCall);
        expect(thrown).toBeInstanceOf(HtmlProcessingError);
        expect(thrown).toMatchObject({ reason: 'pass-failed', cause: passError });
    });

    test('treats an unexpected image conversion exception as fatal', async () => {
        const cause = new Error('Resource API unavailable');
        vi.spyOn(resourceConverter, 'convertImagesToResources').mockRejectedValue(cause);
        const options: PasteOptions = {
            ...defaultOptions,
            includeImages: true,
            convertImagesToResources: true,
        };

        let thrown: unknown;
        try {
            await processHtml('<img src="data:image/png;base64,AAAA">', options, false);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(HtmlProcessingError);
        expect(thrown).toMatchObject({ reason: 'image-conversion-failed', cause });
    });
});
