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
 * - On any failure, we log and fall back to returning the raw HTML unchanged.
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
    readonly html: string;
    readonly body: HTMLElement | null;
    readonly resources: ResourceConversionMeta;
}

const EMPTY_RESOURCES: ResourceConversionMeta = { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 };

const createFallbackBody = (html: string): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    const implementation = document.implementation;
    if (!implementation || typeof implementation.createHTMLDocument !== 'function') return null;
    const fallbackDoc = implementation.createHTMLDocument('');
    const { body } = fallbackDoc;
    body.innerHTML = html;
    return body;
};

export async function processHtml(
    html: string,
    options: PasteOptions,
    isGoogleDocs: boolean = false
): Promise<ProcessHtmlResult> {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return { html, body: createFallbackBody(html), resources: EMPTY_RESOURCES };
    }
    try {
        const rawParser = new DOMParser();
        const rawDoc = rawParser.parseFromString(html, 'text/html');
        const rawBody = rawDoc.body;
        if (!rawBody) {
            return { html, body: createFallbackBody(html), resources: EMPTY_RESOURCES };
        }
        try {
            normalizeTextCharacters(rawBody, options.normalizeQuotes);
        } catch {}
        removeNonContentUi(rawBody);
        // Promote <img style=width/height> to attributes so sizing survives sanitize and Turndown sees it
        promoteImageSizingStylesToAttributes(rawBody);
        // Simplify anchors that wrap images by removing non-image children (UI/metadata) so downstream unwrapping can apply
        pruneNonImageAnchorChildren(rawBody);
        // Prevent turndown from emitting stray ** when pasting google docs content
        if (isGoogleDocs) {
            removeGoogleDocsWrappers(rawBody);
        }
        neutralizeCodeBlocksPreSanitize(rawBody);

        const intermediate = rawBody.innerHTML;
        const purifier = createDOMPurify(window as unknown as typeof window);
        const sanitized = purifier.sanitize(
            intermediate,
            buildSanitizerConfig({ includeImages: options.includeImages })
        ) as string;

        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized, 'text/html');
        const body = doc.body;
        if (!body) {
            return { html, body: createFallbackBody(html), resources: EMPTY_RESOURCES };
        }

        if (!options.includeImages) removeEmptyAnchors(body);
        cleanHeadingAnchors(body);
        normalizeTextCharacters(body, options.normalizeQuotes);
        // Wrap literal HTML tag tokens in inline code to prevent accidental HTML interpretation downstream
        protectLiteralHtmlTagMentions(body);
        normalizeCodeBlocks(body);
        markNbspOnlyInlineCode(body);
        normalizeImageAltAttributes(body);

        let resourceIds: string[] = [];
        let attempted = 0;
        let failed = 0;
        if (options.includeImages) {
            if (options.convertImagesToResources) {
                const result = await convertImagesToResources(body);
                resourceIds = result.ids;
                attempted = result.attempted;
                failed = result.failed;
                standardizeRemainingImages(body);
            } else {
                standardizeRemainingImages(body);
            }
            normalizeImageAltAttributes(body);
        }
        const finalHtml = body.innerHTML;
        return {
            html: finalHtml,
            body,
            resources: { resourcesCreated: resourceIds.length, resourceIds, attempted, failed },
        };
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        if (err instanceof Error && (err as Error).stack) console.warn((err as Error).stack);
        return { html, body: createFallbackBody(html), resources: EMPTY_RESOURCES };
    }
}
