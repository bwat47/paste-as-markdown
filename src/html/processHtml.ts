/**
 * High-level HTML processing pipeline used before converting to Markdown.
 *
 * Key invariants:
 * - DOMPurify is the security boundary. Sanitization failure aborts conversion with an error toast.
 * - KEEP_CONTENT is enabled, so forbidden tags are removed but text remains; structural cleanup happens pre-sanitize.
 * - Post-sanitize/image passes fail gracefully, falling back to sanitized HTML.
 * - Pass execution order is centralized in `passes/registry.ts`.
 *
 * See processHtml() function below for the 8-phase pipeline structure.
 */

import type { PasteOptions, ResourceConversionMeta } from '../types';
import { TOAST_MESSAGES, POST_IMAGE_PASS_PRIORITY } from '../constants';
import { convertImagesToResources } from '../resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';
import { getProcessingPasses } from './passes/registry';
import { runPasses } from './passes/runner';
import type { PassContext } from './passes/types';
import { showToast } from '../utils';
import { ToastType } from 'api/types';
import logger from '../logger';

export interface ProcessHtmlResult {
    readonly body: HTMLElement | null; // Processed DOM body. Null only when DOM processing failed but sanitization succeeded.
    readonly sanitizedHtml: string | null; // Sanitized HTML string. Always present when body is null.
    readonly resources: ResourceConversionMeta; // Metadata about any image-to-resource conversions. Empty in fallback mode.
}

const EMPTY_RESOURCES: ResourceConversionMeta = {
    resourcesCreated: 0,
    resourceIds: [],
    attempted: 0,
    failed: 0,
};

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Attempts to parse HTML string into a DOM body element.
 * Returns null if parsing fails or body is missing.
 */
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

/**
 * Performs DOMPurify sanitization on HTML.
 * Throws if window is unavailable or sanitization fails.
 */
function performSanitization(html: string, includeImages: boolean): string {
    if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
    }
    const purifier = createDOMPurify(window as unknown as typeof window);
    return purifier.sanitize(html, buildSanitizerConfig({ includeImages })) as string;
}

/**
 * Splits post-sanitize passes into pre-image and post-image groups
 * based on POST_IMAGE_PASS_PRIORITY threshold.
 * POST_IMAGE_PASS_PRIORITY is defined in constants.ts to keep registry/test usage in sync.
 */
function splitPassesByPriority(passes: ReturnType<typeof getProcessingPasses>['postSanitize']) {
    return {
        preImage: passes.filter((p) => p.priority < POST_IMAGE_PASS_PRIORITY),
        postImage: passes.filter((p) => p.priority >= POST_IMAGE_PASS_PRIORITY),
    };
}

/**
 * Handles image conversion to Joplin resources if enabled.
 * Returns resource metadata (empty if conversion disabled or not attempted).
 */
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

/**
 * Attempts best-effort sanitization for fallback scenarios.
 * Returns sanitized HTML string or null if sanitization fails.
 */
function sanitizeForFallback(html: string, includeImages: boolean): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const purifier = createDOMPurify(window as unknown as typeof window);
        return purifier.sanitize(html, buildSanitizerConfig({ includeImages })) as string;
    } catch (err) {
        logger.warn('Fallback sanitization failed', err);
        return null;
    }
}

/**
 * Creates a ProcessHtmlResult from sanitized HTML string (no DOM body).
 * Returns null if sanitized HTML is null.
 */
function createSanitizedOnlyResult(sanitized: string | null): ProcessHtmlResult | null {
    if (sanitized === null) return null;
    return {
        body: null,
        sanitizedHtml: sanitized,
        resources: EMPTY_RESOURCES,
    };
}

/**
 * Attempts to create a fallback result using best-effort sanitization.
 */
async function attemptSanitizedFallback(html: string, includeImages: boolean): Promise<ProcessHtmlResult | null> {
    const sanitized = sanitizeForFallback(html, includeImages);
    return createSanitizedOnlyResult(sanitized);
}

// ============================================================================
// Main Pipeline
// ============================================================================

export async function processHtml(
    html: string,
    options: PasteOptions,
    isGoogleDocs: boolean = false
): Promise<ProcessHtmlResult> {
    // ========================================================================
    // Phase 0: Prerequisites Check
    // ========================================================================
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        logger.warn('DOM APIs unavailable; cannot process HTML safely.');
        return await notifyFailure('dom-unavailable');
    }

    const passContext: PassContext = { isGoogleDocs };
    const { preSanitize, postSanitize } = getProcessingPasses();
    const { preImage, postImage } = splitPassesByPriority(postSanitize);
    let sanitizedHtml: string | null = null;

    try {
        // ====================================================================
        // Phase 1: Parse Raw HTML
        // ====================================================================
        const rawBody = parseHtmlToBody(html, 'Raw HTML parse');
        if (!rawBody) {
            const fallback = await attemptSanitizedFallback(html, options.includeImages);
            if (fallback) return fallback;
            return await notifyFailure('sanitize-failed');
        }

        // ====================================================================
        // Phase 2: Pre-Sanitize Passes
        // ====================================================================
        runPasses(preSanitize, rawBody, options, passContext);

        // ====================================================================
        // Phase 3: Sanitize (Security Boundary)
        // ====================================================================
        try {
            sanitizedHtml = performSanitization(rawBody.innerHTML, options.includeImages);
        } catch (err) {
            logger.warn('Sanitization failed; no safe HTML output available', err);
            return await notifyFailure('sanitize-failed');
        }

        // ====================================================================
        // Phase 4: Parse Sanitized HTML
        // ====================================================================
        const body = parseHtmlToBody(sanitizedHtml, 'Sanitized HTML parse');
        if (!body) {
            logger.warn('Sanitized HTML lacked <body>, using sanitized HTML fallback.');
            return createSanitizedOnlyResult(sanitizedHtml)!;
        }

        // ====================================================================
        // Phase 5: Post-Sanitize Passes (Pre-Image)
        // ====================================================================
        runPasses(preImage, body, options, passContext);

        // ====================================================================
        // Phase 6: Image Conversion (Optional)
        // ====================================================================
        let resources: ResourceConversionMeta;
        try {
            resources = await handleImageConversion(body, options);
        } catch (err) {
            logger.warn('Image resource conversion failed, using sanitized HTML fallback', err);
            return createSanitizedOnlyResult(sanitizedHtml)!;
        }

        // ====================================================================
        // Phase 7: Post-Image Passes (Optional)
        // ====================================================================
        if (options.includeImages && postImage.length > 0) {
            runPasses(postImage, body, options, passContext);
        }

        // ====================================================================
        // Phase 8: Return Final Result
        // ====================================================================
        return {
            body,
            sanitizedHtml,
            resources,
        };
    } catch (err) {
        // ====================================================================
        // Global Error Handler: Attempt Secure Fallback
        // ====================================================================
        logger.warn('HTML processing failed, evaluating secure fallback', err);
        if (sanitizedHtml !== null) {
            return createSanitizedOnlyResult(sanitizedHtml)!;
        }
        const fallback = await attemptSanitizedFallback(html, options.includeImages);
        if (fallback) return fallback;
        return await notifyFailure('sanitize-failed');
    }
}
