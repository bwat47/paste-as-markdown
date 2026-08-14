import { describe, expect, test, afterEach, vi } from 'vitest';
import { HtmlProcessingError, processHtml } from '../html/processHtml';
import * as passRunner from '../html/passes/runner';
import { PROCESSING_PASSES } from '../html/passes/registry';
import * as resourceConverter from '../resourceConverter';
import logger from '../logger';
import type { ProcessingPass } from '../html/passes/types';
import { pasteOptions } from './helpers/pasteOptions';

/** Everything off, so each test opts into only the flags whose passes it asserts on. */
const inertOptions = pasteOptions({ includeImages: false, normalizeQuotes: false });

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
        const result = await processHtml(html, inertOptions);

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
    ])('turns a $phase pass error into a fatal HTML processing error', async ({ phase, failingCall }) => {
        const cause = new Error(`${phase} failed`);
        const passError = new passRunner.PassExecutionError(`${phase} test pass`, cause);
        let callCount = 0;
        const runPassesSpy = vi.spyOn(passRunner, 'runPasses').mockImplementation(() => {
            callCount++;
            if (callCount === failingCall) throw passError;
        });

        let thrown: unknown;
        try {
            await processHtml('<p>Content</p>', inertOptions);
        } catch (error) {
            thrown = error;
        }

        expect(runPassesSpy).toHaveBeenCalledTimes(failingCall);
        expect(thrown).toBeInstanceOf(HtmlProcessingError);
        expect(thrown).toMatchObject({ reason: 'pass-failed', cause: passError });
    });

    test('classifies an unclassified error as unexpected rather than a sanitization failure', async () => {
        const cause = new Error('Escaped a stage that should classify its own failures');
        vi.spyOn(passRunner, 'runPasses').mockImplementation(() => {
            throw cause;
        });

        let thrown: unknown;
        try {
            await processHtml('<p>Content</p>', inertOptions);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(HtmlProcessingError);
        expect(thrown).toMatchObject({ reason: 'unexpected', cause });
    });

    test('keeps the converted DOM when a post-image pass fails', async () => {
        // Resources are already created at this point, so aborting would orphan them without
        // making the output any more correct: the remaining transforms are cosmetic.
        const passError = new passRunner.PassExecutionError('post-image test pass', new Error('post-image failed'));
        const options = {
            ...inertOptions,
            includeImages: true,
            convertImagesToResources: true,
        };
        vi.spyOn(resourceConverter, 'convertImagesToResources').mockImplementation(async (body) => {
            const image = body.querySelector('img');
            image?.setAttribute('src', ':/resource-id');
            image?.setAttribute('data-pam-converted', 'true');
            return { ids: ['resource-id'], attempted: 1, failed: 0 };
        });
        let callCount = 0;
        const runPassesSpy = vi.spyOn(passRunner, 'runPasses').mockImplementation(() => {
            callCount++;
            if (callCount === 3) throw passError;
        });
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

        const result = await processHtml('<img src="https://example.com/image.png">', options);

        expect(runPassesSpy).toHaveBeenCalledTimes(3);
        expect(result.resources).toEqual({
            resourcesCreated: 1,
            resourceIds: ['resource-id'],
            attempted: 1,
            failed: 0,
        });
        expect(result.body.querySelector('img')?.getAttribute('src')).toBe(':/resource-id');
        expect(warnSpy).toHaveBeenCalledWith('Post-image pass failed; continuing with converted images', passError);
    });

    test('treats an unexpected image conversion exception as fatal', async () => {
        const cause = new Error('Resource API unavailable');
        vi.spyOn(resourceConverter, 'convertImagesToResources').mockRejectedValue(cause);
        const options = {
            ...inertOptions,
            includeImages: true,
            convertImagesToResources: true,
        };

        let thrown: unknown;
        try {
            await processHtml('<img src="data:image/png;base64,AAAA">', options);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(HtmlProcessingError);
        expect(thrown).toMatchObject({ reason: 'image-conversion-failed', cause });
    });
});
