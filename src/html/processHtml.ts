/**
 * High-level HTML processing pipeline used before converting to Markdown.
 *
 * Phases
 * 1) Parse raw HTML
 * 2) Pre-sanitize passes (order defined in `passes/registry.ts`)
 * 3) Sanitize via DOMPurify (configured in sanitizerConfig)
 *    Note: KEEP_CONTENT is enabled, so forbidden tags drop but their text may remain; hence structural cleanup happens pre-sanitize.
 * 4) Post-sanitize passes (order defined in `passes/registry.ts`)
 * 5) Image handling (optional conversion to Joplin resources, then post-image passes)
 *
 * Invariants and rationale
 * - All text normalization avoids code/pre to preserve literal examples and spacing.
 * - Early normalization + UI removal makes behavior robust against DOM structure from real-world fragments.
 * - DOMPurify is the security boundary. If parsing or sanitization fails, we surface an error toast and abort conversion.
 * - Post-sanitize cleanup is best-effort. On failure we return DOMPurify's sanitized HTML.
 * - Pass execution is centralized in the registry so new passes register once and maintain priority ordering.
 */

import type { PasteOptions, ResourceConversionMeta } from '../types';
import { LOG_PREFIX, TOAST_MESSAGES, POST_IMAGE_PASS_PRIORITY } from '../constants';
import { convertImagesToResources } from '../resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';
import { getProcessingPasses } from './passes/registry';
import { runPasses } from './passes/runner';
import type { PassContext } from './passes/types';
import { showToast } from '../utils';
import { ToastType } from 'api/types';

export interface ProcessHtmlResult {
    readonly body: HTMLElement | null; // Processed DOM body. Null only when DOM processing failed but sanitization succeeded
    readonly sanitizedHtml: string | null; // Sanitized HTML string. Always present when body is null.
    readonly resources: ResourceConversionMeta;
}

const EMPTY_RESOURCES: ResourceConversionMeta = {
    resourcesCreated: 0,
    resourceIds: [],
    attempted: 0,
    failed: 0,
};

// Note: POST_IMAGE_PASS_PRIORITY is defined in constants.ts to keep registry/test usage in sync

type HtmlProcessingFailureReason = 'dom-unavailable' | 'sanitize-failed';

const FAILURE_MESSAGES: Record<HtmlProcessingFailureReason, string> = {
    'dom-unavailable': TOAST_MESSAGES.DOM_UNAVAILABLE,
    'sanitize-failed': TOAST_MESSAGES.HTML_PROCESSING_FAILED,
};

export class HtmlProcessingError extends Error {
    readonly reason: HtmlProcessingFailureReason;

    constructor(reason: HtmlProcessingFailureReason) {
        super(FAILURE_MESSAGES[reason]);
        this.name = 'HtmlProcessingError';
        this.reason = reason;
    }
}

const notifyFailure = async (reason: HtmlProcessingFailureReason): Promise<never> => {
    await showToast(FAILURE_MESSAGES[reason], ToastType.Error);
    throw new HtmlProcessingError(reason);
};

const sanitizeForFallback = (html: string, includeImages: boolean): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        const purifier = createDOMPurify(window as unknown as typeof window);
        return purifier.sanitize(html, buildSanitizerConfig({ includeImages })) as string;
    } catch (err) {
        console.warn(LOG_PREFIX, 'Fallback sanitization failed:', err);
        return null;
    }
};

const sanitizedHtmlFallback = (sanitized: string | null): ProcessHtmlResult | null => {
    if (sanitized === null) return null;
    return {
        body: null,
        sanitizedHtml: sanitized,
        resources: EMPTY_RESOURCES,
    };
};

export async function processHtml(
    html: string,
    options: PasteOptions,
    isGoogleDocs: boolean = false
): Promise<ProcessHtmlResult> {
    // Abort if DOM APIs are unavailable (security boundary)
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        console.warn(LOG_PREFIX, 'DOM APIs unavailable; cannot process HTML safely.');
        return await notifyFailure('dom-unavailable');
    }

    let sanitizedHtml: string | null = null;
    const passContext: PassContext = { isGoogleDocs };
    const { preSanitize, postSanitize } = getProcessingPasses();

    try {
        // Parse raw HTML into DOM
        const rawParser = new DOMParser();
        const rawDoc = rawParser.parseFromString(html, 'text/html');
        const rawBody = rawDoc.body;
        if (!rawBody) {
            console.warn(LOG_PREFIX, 'Parsed document missing <body>, attempting sanitized fallback.');
            const fallback = sanitizedHtmlFallback(sanitizeForFallback(html, options.includeImages));
            if (fallback) return fallback;
            return await notifyFailure('sanitize-failed');
        }

        // Run pre-sanitize passes (structural normalization, UI cleanup, etc.)
        runPasses(preSanitize, rawBody, options, passContext);

        // Sanitize HTML for security (DOMPurify is the hard boundary)
        const intermediate = rawBody.innerHTML;
        const purifier = createDOMPurify(window as unknown as typeof window);

        try {
            sanitizedHtml = purifier.sanitize(
                intermediate,
                buildSanitizerConfig({ includeImages: options.includeImages })
            ) as string;
        } catch (err) {
            // Abort if sanitization fails
            console.warn(LOG_PREFIX, 'Sanitization failed; no safe HTML output available:', err);
            return await notifyFailure('sanitize-failed');
        }

        // Parse sanitized HTML for post-sanitize passes
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedHtml, 'text/html');
        const body = doc.body;
        if (!body) {
            // Fallback: return sanitized HTML only if <body> missing
            console.warn(LOG_PREFIX, 'Sanitized HTML lacked <body>, using sanitized HTML fallback.');
            return { body: null, sanitizedHtml, resources: EMPTY_RESOURCES };
        }

        // Run post-sanitize passes before image conversion
        const preImagePasses = postSanitize.filter((pass) => pass.priority < POST_IMAGE_PASS_PRIORITY);
        runPasses(preImagePasses, body, options, passContext);

        let resourceIds: string[] = [];
        let attempted = 0;
        let failed = 0;

        // Optionally convert images to Joplin resources
        if (options.includeImages) {
            if (options.convertImagesToResources) {
                try {
                    const result = await convertImagesToResources(body);
                    resourceIds = result.ids;
                    attempted = result.attempted;
                    failed = result.failed;
                } catch (err) {
                    // If image conversion fails, return sanitized HTML only
                    console.warn(LOG_PREFIX, 'Image resource conversion failed, using sanitized HTML fallback:', err);
                    return { body: null, sanitizedHtml, resources: EMPTY_RESOURCES };
                }
            }

            // Run post-image passes (e.g., image attribute normalization)
            const postImagePasses = postSanitize.filter((pass) => pass.priority >= POST_IMAGE_PASS_PRIORITY);
            if (postImagePasses.length > 0) {
                runPasses(postImagePasses, body, options, passContext);
            }
        }

        // Return processed DOM body, sanitized HTML, and resource metadata
        return {
            body,
            sanitizedHtml,
            resources: { resourcesCreated: resourceIds.length, resourceIds, attempted, failed },
        };
    } catch (err) {
        // On error, fallback to sanitized HTML if available, otherwise abort
        console.warn(LOG_PREFIX, 'HTML processing failed, evaluating secure fallback:', err);
        if (sanitizedHtml !== null) {
            return { body: null, sanitizedHtml, resources: EMPTY_RESOURCES };
        }
        const fallback = sanitizedHtmlFallback(sanitizeForFallback(html, options.includeImages));
        if (fallback) return fallback;
        return await notifyFailure('sanitize-failed');
    }
}
