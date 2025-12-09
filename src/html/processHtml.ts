/**
 * High-level HTML processing pipeline used before converting to Markdown.
 *
 * Key invariants:
 * - DOMPurify is the security boundary. Sanitization failure throws HtmlProcessingError.
 * - KEEP_CONTENT is enabled, so forbidden tags are removed but text remains; structural cleanup happens pre-sanitize.
 * - Pass execution order is centralized in `passes/registry.ts`.
 * - Image conversion failures are handled gracefully (images skipped, processing continues).
 *
 * Error handling contract:
 * - Throws HtmlProcessingError when processing cannot proceed (missing DOM APIs or sanitization failure)
 * - Callers should catch HtmlProcessingError, show appropriate toast, and attempt plain text fallback
 * - Returns a valid DOM body on success; never returns null
 *
 * See processHtml() function below for the pipeline structure.
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

/**
 * Thrown when HTML processing cannot proceed due to missing prerequisites
 * (DOM APIs unavailable) or sanitization failure.
 *
 * Callers should:
 * 1. Show an appropriate error toast to the user
 * 2. Attempt plain text fallback
 * 3. Return a ConversionFailure result
 */
export class HtmlProcessingError extends Error {
    readonly reason: HtmlProcessingFailureReason;

    constructor(reason: HtmlProcessingFailureReason) {
        super(FAILURE_MESSAGES[reason]);
        this.name = 'HtmlProcessingError';
        this.reason = reason;
    }
}

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
function splitPassesByPriority(passes: ReturnType<typeof getProcessingPasses>['postSanitize']): {
    preImage: typeof passes;
    postImage: typeof passes;
} {
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
        throw new HtmlProcessingError('dom-unavailable');
    }

    const passContext: PassContext = { isGoogleDocs };
    const { preSanitize, postSanitize } = getProcessingPasses();
    const { preImage, postImage } = splitPassesByPriority(postSanitize);

    try {
        // ====================================================================
        // Phase 1: Parse Raw HTML
        // ====================================================================
        const rawBody = parseHtmlToBody(html, 'Raw HTML parse');
        if (!rawBody) {
            throw new HtmlProcessingError('sanitize-failed');
        }

        // ====================================================================
        // Phase 2: Pre-Sanitize Passes
        // ====================================================================
        runPasses(preSanitize, rawBody, options, passContext);

        // ====================================================================
        // Phase 3: Sanitize (Security Boundary)
        // ====================================================================
        let sanitizedHtml: string;
        try {
            sanitizedHtml = performSanitization(rawBody.innerHTML, options.includeImages);
        } catch (err) {
            logger.warn('Sanitization failed; no safe HTML output available', err);
            throw new HtmlProcessingError('sanitize-failed');
        }

        // ====================================================================
        // Phase 4: Parse Sanitized HTML
        // ====================================================================
        const body = parseHtmlToBody(sanitizedHtml, 'Sanitized HTML parse');
        if (!body) {
            throw new HtmlProcessingError('sanitize-failed');
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
            logger.warn('Image resource conversion failed; continuing without image resources', err);
            resources = EMPTY_RESOURCES;
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
        return { body, resources };
    } catch (err) {
        // ====================================================================
        // Global Error Handler
        // ====================================================================
        if (err instanceof HtmlProcessingError) {
            throw err;
        }
        logger.warn('Unexpected error in HTML processing', err);
        throw new HtmlProcessingError('sanitize-failed');
    }
}
