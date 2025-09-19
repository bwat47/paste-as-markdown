/**
 * High-level HTML processing pipeline used before converting to Markdown.
 *
 * Phases
 * 1) Parse raw HTML
 * 2) Pre-sanitize passes (order matters):
 *    - normalizeTextCharacters: normalize NBSP and optionally smart quotes; skips code/pre
 *    - removeNonContentUi: drop obvious UI controls (buttons, role-based widgets, non-checkbox inputs, select)
 *    - neutralizeCodeBlocksPreSanitize: turn <pre>/<code> innerHTML into plain text so DOMPurify won’t strip examples
 * 3) Sanitize via DOMPurify (configured in sanitizerConfig)
 *    Note: KEEP_CONTENT is enabled, so forbidden tags drop but their text may remain; hence UI removal is done pre-sanitize.
 * 4) Post-sanitize passes:
 *    - removeEmptyAnchors, cleanHeadingAnchors
 *    - normalizeTextCharacters again (idempotent; resilient to structure changes)
 *    - normalizeCodeBlocks (unwrap known wrappers, ensure <code>, infer language, strip UI chrome)
 *    - markNbspOnlyInlineCode (protects NBSP-only inline code from being dropped later)
 *    - normalizeImageAltAttributes (collapse alt whitespace/newlines)
 * 5) Image handling (optional conversion to Joplin resources, then standardize attributes)
 *
 * Invariants and rationale
 * - All text normalization avoids code/pre to preserve literal examples and spacing.
 * - Early normalization + UI removal makes behavior robust against DOM structure from real-world fragments.
 * - DOMPurify is the security boundary. If parsing or sanitization fails, we fall back to plain text.
 * - Post-sanitize cleanup is best-effort. On failure we return DOMPurify's sanitized HTML.
 */

import type { PasteOptions, ResourceConversionMeta } from '../types';
import { LOG_PREFIX } from '../constants';
import { convertImagesToResources, standardizeRemainingImages } from '../resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';

import { normalizeTextCharacters } from './pre/normalizeText';
import { removeNonContentUi } from './pre/uiCleanup';
import { promoteImageSizingStylesToAttributes } from './pre/imageSizing';
import { neutralizeCodeBlocksPreSanitize } from './pre/codeNeutralize';
import { pruneNonImageAnchorChildren } from './pre/imageAnchorCleanup';
import { removeGoogleDocsWrappers } from './pre/wrapperCleanup';
import { removeEmptyAnchors, cleanHeadingAnchors } from './post/anchors';
import { normalizeCodeBlocks, markNbspOnlyInlineCode } from './post/codeBlocks';
import { protectLiteralHtmlTagMentions } from './post/literals';
import { normalizeImageAltAttributes } from './post/images';

export interface ProcessHtmlResult {
    readonly body: HTMLElement | null;
    readonly sanitizedHtml: string | null;
    readonly plainText: string | null;
    readonly resources: ResourceConversionMeta;
}

const EMPTY_RESOURCES: ResourceConversionMeta = {
    resourcesCreated: 0,
    resourceIds: [],
    attempted: 0,
    failed: 0,
};

const createDetachedBody = (html: string, asPlainText: boolean = false): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    const implementation = document.implementation;
    if (!implementation || typeof implementation.createHTMLDocument !== 'function') return null;
    const detachedDoc = implementation.createHTMLDocument('');
    const { body } = detachedDoc;
    if (asPlainText) {
        body.textContent = html;
    } else {
        body.innerHTML = html;
    }
    return body;
};

const htmlToPlainText = (html: string): string => {
    if (typeof document !== 'undefined') {
        const body = createDetachedBody(html);
        if (body) return body.textContent ?? '';
    }
    return html
        .replace(/<br\s*\/?>(?=\s*\n?)/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();
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
        plainText: null,
        resources: EMPTY_RESOURCES,
    };
};

const plainTextFallback = (html: string): ProcessHtmlResult => ({
    body: createDetachedBody(html, true),
    sanitizedHtml: null,
    plainText: htmlToPlainText(html),
    resources: EMPTY_RESOURCES,
});

export async function processHtml(
    html: string,
    options: PasteOptions,
    isGoogleDocs: boolean = false
): Promise<ProcessHtmlResult> {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        console.warn(LOG_PREFIX, 'DOM APIs unavailable, falling back to plain text.');
        return plainTextFallback(html);
    }

    let sanitizedHtml: string | null = null;

    const runSafely = (description: string, fn: () => void): void => {
        try {
            fn();
        } catch (err) {
            console.warn(LOG_PREFIX, `${description} failed:`, err);
        }
    };

    try {
        const rawParser = new DOMParser();
        const rawDoc = rawParser.parseFromString(html, 'text/html');
        const rawBody = rawDoc.body;
        if (!rawBody) {
            console.warn(LOG_PREFIX, 'Parsed document missing <body>, attempting sanitized fallback.');
            const fallback = sanitizedHtmlFallback(sanitizeForFallback(html, options.includeImages));
            if (fallback) return fallback;
            return plainTextFallback(html);
        }

        runSafely('Pre-sanitize text normalization', () => normalizeTextCharacters(rawBody, options.normalizeQuotes));
        runSafely('Pre-sanitize non-content UI removal', () => removeNonContentUi(rawBody));
        runSafely('Image sizing promotion', () => promoteImageSizingStylesToAttributes(rawBody));
        runSafely('Image anchor cleanup', () => pruneNonImageAnchorChildren(rawBody));
        if (isGoogleDocs) {
            runSafely('Google Docs wrapper removal', () => removeGoogleDocsWrappers(rawBody));
        }
        runSafely('Code block neutralization', () => neutralizeCodeBlocksPreSanitize(rawBody));

        const intermediate = rawBody.innerHTML;
        const purifier = createDOMPurify(window as unknown as typeof window);

        try {
            sanitizedHtml = purifier.sanitize(
                intermediate,
                buildSanitizerConfig({ includeImages: options.includeImages })
            ) as string;
        } catch (err) {
            console.warn(LOG_PREFIX, 'Sanitization failed, falling back to plain text:', err);
            return plainTextFallback(html);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedHtml, 'text/html');
        const body = doc.body;
        if (!body) {
            console.warn(LOG_PREFIX, 'Sanitized HTML lacked <body>, using sanitized HTML fallback.');
            return { body: null, sanitizedHtml, plainText: null, resources: EMPTY_RESOURCES };
        }

        runSafely('Post-sanitize empty anchor removal', () => {
            if (!options.includeImages) removeEmptyAnchors(body);
        });
        runSafely('Post-sanitize heading anchor cleanup', () => cleanHeadingAnchors(body));
        runSafely('Post-sanitize text normalization', () => normalizeTextCharacters(body, options.normalizeQuotes));
        runSafely('Literal HTML tag protection', () => protectLiteralHtmlTagMentions(body));
        runSafely('Code block normalization', () => normalizeCodeBlocks(body));
        runSafely('NBSP inline code sentinel marking', () => markNbspOnlyInlineCode(body));
        runSafely('Image alt normalization', () => normalizeImageAltAttributes(body));

        let resourceIds: string[] = [];
        let attempted = 0;
        let failed = 0;

        if (options.includeImages) {
            if (options.convertImagesToResources) {
                try {
                    const result = await convertImagesToResources(body);
                    resourceIds = result.ids;
                    attempted = result.attempted;
                    failed = result.failed;
                } catch (err) {
                    console.warn(LOG_PREFIX, 'Image resource conversion failed, using sanitized HTML fallback:', err);
                    return { body: null, sanitizedHtml, plainText: null, resources: EMPTY_RESOURCES };
                }
            }

            runSafely('Image standardization', () => standardizeRemainingImages(body));
            runSafely('Post-image alt normalization', () => normalizeImageAltAttributes(body));
        }

        return {
            body,
            sanitizedHtml,
            plainText: null,
            resources: { resourcesCreated: resourceIds.length, resourceIds, attempted, failed },
        };
    } catch (err) {
        console.warn(LOG_PREFIX, 'HTML processing failed, evaluating secure fallback:', err);
        if (sanitizedHtml !== null) {
            return { body: null, sanitizedHtml, plainText: null, resources: EMPTY_RESOURCES };
        }
        const fallback = sanitizedHtmlFallback(sanitizeForFallback(html, options.includeImages));
        if (fallback) return fallback;
        return plainTextFallback(html);
    }
}
