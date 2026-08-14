/**
 * HTML processing pipeline: parse → pre-sanitize passes → DOMPurify → post-sanitize passes →
 * image conversion → post-image passes.
 * Throws HtmlProcessingError on failure; callers should catch and attempt plain text fallback.
 */

import type { PasteOptions, ResourceConversionMeta } from '../types';
import { convertImagesToResources } from '../resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';
import { PROCESSING_PASSES } from './passes/registry';
import { PassExecutionError, runPasses } from './passes/runner';
import type { PassContext } from './passes/types';
import logger from '../logger';

export interface ProcessHtmlResult {
    readonly body: HTMLElement;
    readonly resources: ResourceConversionMeta;
}

const EMPTY_RESOURCES: ResourceConversionMeta = {
    resourcesCreated: 0,
    resourceIds: [],
    attempted: 0,
    failed: 0,
};

type HtmlProcessingFailureReason =
    | 'dom-unavailable'
    | 'sanitize-failed'
    | 'pass-failed'
    | 'image-conversion-failed'
    | 'unexpected';

const FAILURE_MESSAGES: Record<HtmlProcessingFailureReason, string> = {
    'dom-unavailable': 'DOM APIs unavailable; cannot process HTML safely.',
    'sanitize-failed': 'HTML sanitization failed; unable to continue processing.',
    'pass-failed': 'HTML cleanup failed; unable to continue processing safely.',
    'image-conversion-failed': 'Image conversion failed unexpectedly; unable to continue processing safely.',
    unexpected: 'HTML processing failed unexpectedly; unable to continue processing safely.',
};

/** Thrown when HTML processing cannot guarantee safe, correct output. */
export class HtmlProcessingError extends Error {
    readonly reason: HtmlProcessingFailureReason;

    constructor(reason: HtmlProcessingFailureReason, cause?: unknown) {
        // `cause` is the native ES2022 Error option. Do not redeclare it as a class field:
        // under `useDefineForClassFields` that would shadow the native property with undefined.
        super(FAILURE_MESSAGES[reason], { cause });
        this.name = 'HtmlProcessingError';
        this.reason = reason;
    }
}

/** Parse HTML string into a DOM body element. Returns null on failure. */
function parseHtmlToBody(html: string, context: string): HTMLElement | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        if (!doc.body) {
            logger.warn(`${context}: Parsed document missing <body>`);
            return null;
        }
        return doc.body;
    } catch (err) {
        logger.warn(`${context}: Failed to parse HTML`, err);
        return null;
    }
}

/** Run DOMPurify sanitization. Throws if window is unavailable. */
function performSanitization(html: string, includeImages: boolean): string {
    if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
    }
    const purifier = createDOMPurify(window as unknown as typeof window);
    return purifier.sanitize(html, buildSanitizerConfig({ includeImages })) as string;
}

/** Convert images to Joplin resources if enabled. Returns empty metadata if disabled. */
async function handleImageConversion(body: HTMLElement, options: PasteOptions): Promise<ResourceConversionMeta> {
    if (!options.includeImages || !options.convertImagesToResources) {
        return EMPTY_RESOURCES;
    }

    const result = await convertImagesToResources(body);
    return {
        resourcesCreated: result.ids.length,
        resourceIds: result.ids,
        attempted: result.attempted,
        failed: result.failed,
    };
}

export async function processHtml(
    html: string,
    options: PasteOptions,
    isGoogleDocs: boolean = false
): Promise<ProcessHtmlResult> {
    // Prerequisites check
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        throw new HtmlProcessingError('dom-unavailable');
    }

    const passContext: PassContext = { isGoogleDocs };
    const { preSanitize, postSanitize, postImage } = PROCESSING_PASSES;

    try {
        // 1. Parse raw HTML
        const rawBody = parseHtmlToBody(html, 'Raw HTML parse');
        if (!rawBody) {
            throw new HtmlProcessingError('sanitize-failed');
        }

        // 2. Pre-sanitize passes
        runPasses(preSanitize, rawBody, options, passContext);

        // 3. Sanitize (security boundary)
        let sanitizedHtml: string;
        try {
            sanitizedHtml = performSanitization(rawBody.innerHTML, options.includeImages);
        } catch (cause) {
            throw new HtmlProcessingError('sanitize-failed', cause);
        }

        // 4. Re-parse sanitized HTML
        const body = parseHtmlToBody(sanitizedHtml, 'Sanitized HTML parse');
        if (!body) {
            throw new HtmlProcessingError('sanitize-failed');
        }

        // 5. Post-sanitize passes
        runPasses(postSanitize, body, options, passContext);

        // 6. Image conversion. Expected per-image failures are reported in ResourceConversionMeta;
        // an exception means the stage could not complete reliably.
        let resources: ResourceConversionMeta;
        try {
            resources = await handleImageConversion(body, options);
        } catch (cause) {
            throw new HtmlProcessingError('image-conversion-failed', cause);
        }

        // 7. Post-image passes. Image resources are already committed and no pass runs after this,
        // so a failure here degrades output cosmetically rather than making it incorrect: keep the
        // converted DOM instead of discarding the paste and orphaning the created resources.
        try {
            runPasses(postImage, body, options, passContext);
        } catch (cause) {
            logger.warn('Post-image pass failed; continuing with converted images', cause);
        }

        return { body, resources };
    } catch (cause) {
        if (cause instanceof HtmlProcessingError) {
            throw cause;
        }
        if (cause instanceof PassExecutionError) {
            throw new HtmlProcessingError('pass-failed', cause);
        }
        // Anything else escaped a stage that was expected to classify its own failures.
        throw new HtmlProcessingError('unexpected', cause);
    }
}
