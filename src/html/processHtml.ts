/**
 * HTML processing pipeline: parse → pre-sanitize passes → DOMPurify → post-sanitize passes → image conversion.
 * Throws HtmlProcessingError on failure; callers should catch and attempt plain text fallback.
 */

import type { PasteOptions, ResourceConversionMeta } from '../types';
import { POST_IMAGE_PASS_PRIORITY } from '../constants';
import { convertImagesToResources } from '../resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';
import { getProcessingPasses } from './passes/registry';
import { runPasses } from './passes/runner';
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

type HtmlProcessingFailureReason = 'dom-unavailable' | 'sanitize-failed';

const FAILURE_MESSAGES: Record<HtmlProcessingFailureReason, string> = {
    'dom-unavailable': 'DOM APIs unavailable; cannot process HTML safely.',
    'sanitize-failed': 'HTML sanitization failed; unable to continue processing.',
};

/** Thrown when HTML processing cannot proceed (missing DOM APIs or sanitization failure). */
export class HtmlProcessingError extends Error {
    readonly reason: HtmlProcessingFailureReason;

    constructor(reason: HtmlProcessingFailureReason) {
        super(FAILURE_MESSAGES[reason]);
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

/** Split post-sanitize passes into pre-image and post-image groups by priority threshold. */
function splitPassesByPriority(passes: ReturnType<typeof getProcessingPasses>['postSanitize']): {
    preImage: typeof passes;
    postImage: typeof passes;
} {
    return {
        preImage: passes.filter((p) => p.priority < POST_IMAGE_PASS_PRIORITY),
        postImage: passes.filter((p) => p.priority >= POST_IMAGE_PASS_PRIORITY),
    };
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
        logger.warn('DOM APIs unavailable; cannot process HTML safely.');
        throw new HtmlProcessingError('dom-unavailable');
    }

    const passContext: PassContext = { isGoogleDocs };
    const { preSanitize, postSanitize } = getProcessingPasses();
    const { preImage, postImage } = splitPassesByPriority(postSanitize);

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
        } catch (err) {
            logger.warn('Sanitization failed', err);
            throw new HtmlProcessingError('sanitize-failed');
        }

        // 4. Re-parse sanitized HTML
        const body = parseHtmlToBody(sanitizedHtml, 'Sanitized HTML parse');
        if (!body) {
            throw new HtmlProcessingError('sanitize-failed');
        }

        // 5. Post-sanitize passes (pre-image)
        runPasses(preImage, body, options, passContext);

        // 6. Image conversion (graceful failure)
        let resources: ResourceConversionMeta;
        try {
            resources = await handleImageConversion(body, options);
        } catch (err) {
            logger.warn('Image conversion failed; continuing without resources', err);
            resources = EMPTY_RESOURCES;
        }

        // 7. Post-image passes
        if (options.includeImages && postImage.length > 0) {
            runPasses(postImage, body, options, passContext);
        }

        return { body, resources };
    } catch (err) {
        if (err instanceof HtmlProcessingError) {
            throw err;
        }
        logger.warn('Unexpected error in HTML processing', err);
        throw new HtmlProcessingError('sanitize-failed');
    }
}
