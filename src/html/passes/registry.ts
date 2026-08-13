import { normalizeTextCharacters } from '../pre/normalizeText';
import { removeNonContentUi } from '../pre/uiCleanup';
import { promoteImageSizingStylesToAttributes } from '../pre/imageSizing';
import { pruneNonImageAnchorChildren } from '../pre/imageAnchorCleanup';
import { removeGoogleDocsWrappers } from '../pre/wrapperCleanup';
import { neutralizeCodeBlocksPreSanitize } from '../pre/codeNeutralize';
import { removeEmptyAnchors, normalizeAnchors } from '../post/anchors';
import { stripHeadingFormatting, normalizeHeadingLevels } from '../post/headings';
import { protectLiteralHtmlTagMentions } from '../post/literals';
import {
    fixOrphanNestedLists,
    mergeAdjacentLists,
    unwrapCheckboxParagraphs,
    unwrapInvalidListWrappers,
    unwrapTightListItemParagraphs,
} from '../post/lists';
import { normalizeCodeBlocks, preserveNbspOnlyInlineCode } from '../post/codeBlocks';
import { normalizeImageAltAttributes } from '../post/images';
import { unwrapAllConvertedImageLinks } from '../post/imageLinks';

import type { ProcessingPass } from './types';

export interface PassCollections {
    readonly preSanitize: readonly ProcessingPass[];
    readonly postSanitize: readonly ProcessingPass[];
    readonly postImage: readonly ProcessingPass[];
}

/** Passes execute in array order within each pipeline phase. */
export const PROCESSING_PASSES: PassCollections = {
    preSanitize: [
        {
            name: 'Pre-sanitize text normalization',
            execute: (body, options) => normalizeTextCharacters(body, options.normalizeQuotes),
        },
        {
            name: 'Pre-sanitize non-content UI removal',
            execute: (body) => removeNonContentUi(body),
        },
        {
            name: 'Image sizing promotion',
            // Runs before sanitization because DOMPurify strips sizing styles.
            execute: (body) => promoteImageSizingStylesToAttributes(body),
        },
        {
            name: 'Image anchor cleanup',
            execute: (body) => pruneNonImageAnchorChildren(body),
        },
        {
            name: 'Google Docs wrapper removal',
            condition: (_, context) => context.isGoogleDocs,
            execute: (body) => removeGoogleDocsWrappers(body),
        },
        {
            name: 'Code block neutralization',
            // Runs before sanitization so literal HTML examples such as <script> are preserved as code.
            execute: (body) => neutralizeCodeBlocksPreSanitize(body),
        },
    ],
    postSanitize: [
        {
            name: 'Post-sanitize empty anchor removal',
            execute: (body, options) => removeEmptyAnchors(body, options),
        },
        {
            name: 'Post-sanitize anchor normalization',
            execute: (body) => normalizeAnchors(body),
        },
        {
            name: 'Post-sanitize heading level normalization',
            execute: (body) => normalizeHeadingLevels(body),
        },
        {
            name: 'Post-sanitize plain heading text enforcement',
            execute: (body) => stripHeadingFormatting(body),
        },
        {
            name: 'Post-sanitize checkbox paragraph unwrap',
            execute: (body) => unwrapCheckboxParagraphs(body),
        },
        // Invalid list wrappers must be removed after checkbox paragraphs are unwrapped and before
        // orphaned sub-lists are repaired, so the latter pass sees the corrected list structure.
        {
            name: 'Post-sanitize invalid list wrapper unwrap',
            execute: (body) => unwrapInvalidListWrappers(body),
        },
        {
            name: 'Post-sanitize orphaned sub-list fix',
            execute: (body) => fixOrphanNestedLists(body),
        },
        // The two tight-list passes must run after the orphaned sub-list fix so they see the final
        // list structure. Together they let Turndown emit tight lists without Markdown rewrites.
        {
            name: 'Post-sanitize adjacent list merge',
            condition: (options) => options.forceTightLists,
            execute: (body) => mergeAdjacentLists(body),
        },
        {
            name: 'Post-sanitize tight list paragraph unwrap',
            condition: (options) => options.forceTightLists,
            execute: (body) => unwrapTightListItemParagraphs(body),
        },
        {
            name: 'Post-sanitize text normalization',
            execute: (body, options) => normalizeTextCharacters(body, options.normalizeQuotes),
        },
        {
            name: 'Literal HTML tag protection',
            execute: (body) => protectLiteralHtmlTagMentions(body),
        },
        {
            name: 'Code block normalization',
            execute: (body) => normalizeCodeBlocks(body),
        },
        {
            name: 'NBSP-only inline code preservation',
            execute: (body) => preserveNbspOnlyInlineCode(body),
        },
        {
            name: 'Image alt normalization',
            // Normalizes existing alt text and generates fallback alts from src URLs.
            // Runs unconditionally so all images get proper alt text regardless of settings.
            execute: (body) => normalizeImageAltAttributes(body),
        },
    ],
    postImage: [
        {
            name: 'Converted image link unwrap',
            condition: (options) => options.includeImages && options.convertImagesToResources,
            execute: (body) => unwrapAllConvertedImageLinks(body),
        },
    ],
};
