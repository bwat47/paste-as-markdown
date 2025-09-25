import { normalizeTextCharacters } from '../pre/normalizeText';
import { removeNonContentUi } from '../pre/uiCleanup';
import { promoteImageSizingStylesToAttributes } from '../pre/imageSizing';
import { pruneNonImageAnchorChildren } from '../pre/imageAnchorCleanup';
import { removeGoogleDocsWrappers } from '../pre/wrapperCleanup';
import { neutralizeCodeBlocksPreSanitize } from '../pre/codeNeutralize';
import { unwrapRedundantBoldInHeadings } from '../pre/headingCleanup';
import { removeEmptyAnchors, cleanHeadingAnchors } from '../post/anchors';
import { protectLiteralHtmlTagMentions } from '../post/literals';
import { fixOrphanNestedLists } from '../post/lists';
import { normalizeCodeBlocks, markNbspOnlyInlineCode } from '../post/codeBlocks';
import { normalizeImageAltAttributes } from '../post/images';
import { standardizeRemainingImages } from '../../resourceConverter';

import type { ProcessingPass } from './types';

const PRE_SANITIZE_PASSES: readonly ProcessingPass[] = [
    {
        name: 'Pre-sanitize text normalization',
        phase: 'pre-sanitize',
        priority: 10,
        execute: (body, options) => normalizeTextCharacters(body, options.normalizeQuotes),
    },
    {
        name: 'Pre-sanitize non-content UI removal',
        phase: 'pre-sanitize',
        priority: 20,
        execute: (body) => removeNonContentUi(body),
    },
    {
        name: 'Unwrap redundant bolding in headings',
        phase: 'pre-sanitize',
        priority: 25,
        execute: (body) => unwrapRedundantBoldInHeadings(body),
    },
    {
        name: 'Image sizing promotion',
        phase: 'pre-sanitize', // run before sanitization as DOMpurify will strip styles
        priority: 30,
        execute: (body) => promoteImageSizingStylesToAttributes(body),
    },
    {
        name: 'Image anchor cleanup',
        phase: 'pre-sanitize',
        priority: 40,
        execute: (body) => pruneNonImageAnchorChildren(body),
    },
    {
        name: 'Google Docs wrapper removal',
        phase: 'pre-sanitize',
        priority: 50,
        condition: (_, context) => context.isGoogleDocs,
        execute: (body) => removeGoogleDocsWrappers(body),
    },
    {
        name: 'Code block neutralization',
        phase: 'pre-sanitize', // run before sanitization to prevent examples such as <script> from being stripped from code
        priority: 60,
        execute: (body) => neutralizeCodeBlocksPreSanitize(body),
    },
];

const POST_SANITIZE_PASSES: readonly ProcessingPass[] = [
    {
        name: 'Post-sanitize empty anchor removal',
        phase: 'post-sanitize',
        priority: 10,
        condition: (options) => !options.includeImages,
        execute: (body) => removeEmptyAnchors(body),
    },
    {
        name: 'Post-sanitize heading anchor cleanup',
        phase: 'post-sanitize',
        priority: 20,
        execute: (body) => cleanHeadingAnchors(body),
    },
    {
        name: 'Post-sanitize orphaned sub-list fix',
        phase: 'post-sanitize',
        priority: 25,
        execute: (body) => fixOrphanNestedLists(body),
    },
    {
        name: 'Post-sanitize text normalization',
        phase: 'post-sanitize',
        priority: 30,
        execute: (body, options) => normalizeTextCharacters(body, options.normalizeQuotes),
    },
    {
        name: 'Literal HTML tag protection',
        phase: 'post-sanitize',
        priority: 40,
        execute: (body) => protectLiteralHtmlTagMentions(body),
    },
    {
        name: 'Code block normalization',
        phase: 'post-sanitize',
        priority: 50,
        execute: (body) => normalizeCodeBlocks(body),
    },
    {
        name: 'NBSP inline code sentinel marking',
        phase: 'post-sanitize',
        priority: 60,
        execute: (body) => markNbspOnlyInlineCode(body),
    },
    {
        name: 'Image alt normalization (pre-conversion)',
        phase: 'post-sanitize',
        priority: 70,
        execute: (body) => normalizeImageAltAttributes(body),
    },
    {
        name: 'Image standardization',
        phase: 'post-sanitize',
        priority: 80,
        condition: (options) => options.includeImages,
        execute: (body) => standardizeRemainingImages(body),
    },
    {
        name: 'Image alt normalization (post-conversion)',
        phase: 'post-sanitize',
        priority: 90,
        condition: (options) => options.includeImages,
        execute: (body) => normalizeImageAltAttributes(body),
    },
];

function validatePriorities(passes: readonly ProcessingPass[]): void {
    if (process.env.NODE_ENV === 'production') return;
    const seen = new Map<number, string>();
    passes.forEach((pass) => {
        const existing = seen.get(pass.priority);
        if (existing) {
            throw new Error(`Duplicate priority detected for passes "${existing}" and "${pass.name}"`);
        }
        seen.set(pass.priority, pass.name);
    });
}

function sortPasses(passes: readonly ProcessingPass[]): ProcessingPass[] {
    return [...passes].sort((a, b) => a.priority - b.priority);
}

export interface PassCollections {
    readonly preSanitize: ProcessingPass[];
    readonly postSanitize: ProcessingPass[];
}

export function getProcessingPasses(): PassCollections {
    validatePriorities(PRE_SANITIZE_PASSES);
    validatePriorities(POST_SANITIZE_PASSES);

    const preSanitize = sortPasses(PRE_SANITIZE_PASSES);
    const postSanitize = sortPasses(POST_SANITIZE_PASSES);

    return { preSanitize, postSanitize };
}

export const __TEST__ = {
    validatePriorities,
    sortPasses,
};
