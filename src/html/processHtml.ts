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
import { neutralizeCodeBlocksPreSanitize } from './pre/codeNeutralize';
import { removeEmptyAnchors, cleanHeadingAnchors } from './post/anchors';
import { normalizeCodeBlocks, markNbspOnlyInlineCode } from './post/codeBlocks';
import { normalizeImageAltAttributes } from './post/images';

export async function processHtml(
    html: string,
    options: PasteOptions
): Promise<{ html: string; resources: ResourceConversionMeta }> {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
        return { html, resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 } };
    try {
        const rawParser = new DOMParser();
        const rawDoc = rawParser.parseFromString(html, 'text/html');
        const rawBody = rawDoc.body;
        if (!rawBody) return { html, resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 } };
        try {
            normalizeTextCharacters(rawBody, options.normalizeQuotes);
        } catch {}
        removeNonContentUi(rawBody);
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
        if (!body) return { html, resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 } };

        if (!options.includeImages) removeEmptyAnchors(body);
        cleanHeadingAnchors(body);
        normalizeTextCharacters(body, options.normalizeQuotes);
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
        return {
            html: body.innerHTML,
            resources: { resourcesCreated: resourceIds.length, resourceIds, attempted, failed },
        };
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        if (err instanceof Error && (err as Error).stack) console.warn((err as Error).stack);
        return { html, resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 } };
    }
}
