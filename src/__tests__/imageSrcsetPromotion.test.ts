import { describe, expect, test } from 'vitest';
import { processHtml } from '../html/processHtml';
import { convertHtmlToMarkdown } from './helpers/pasteConversion';
import { pasteOptions } from './helpers/pasteOptions';

/** Resource conversion stays off so the assertions below see the promoted `src` values. */
const IMAGE_OPTIONS = pasteOptions({
    includeImages: true,
    convertImagesToResources: false,
});

const DATA_URL = 'data:image/png;base64,AAAA';

/** Candidate selection cases: the srcset of a src-less image, and the src it should promote. */
interface SelectionCase {
    readonly name: string;
    readonly srcset: string;
    /** Null when no candidate is promotable, which leaves the image unrenderable and removed. */
    readonly expected: string | null;
}

const SELECTION_CASES: readonly SelectionCase[] = [
    {
        name: 'ignores malformed candidates while selecting from valid comparable candidates',
        srcset: 'https://example.com/broken.jpg nope, https://example.com/medium.jpg 800w, https://example.com/large.jpg 1200w',
        expected: 'https://example.com/large.jpg',
    },
    {
        name: 'rejects uppercase descriptor units',
        srcset: 'https://example.com/retina.jpg 2X, https://example.com/wide.jpg 320W',
        expected: null,
    },
    {
        name: 'accepts either case for the density exponent marker',
        srcset: 'https://example.com/small.jpg 1x, https://example.com/big.jpg 1E1x',
        expected: 'https://example.com/big.jpg',
    },
    {
        name: 'accepts a density with no digit before the decimal point',
        srcset: 'https://example.com/half.jpg .5x, https://example.com/quarter.jpg .25x',
        expected: 'https://example.com/half.jpg',
    },
    {
        name: 'rejects a density with no digit after the decimal point',
        srcset: 'https://example.com/broken.jpg 2.x, https://example.com/good.jpg 1x',
        expected: 'https://example.com/good.jpg',
    },
    {
        name: 'prefers width candidates over density candidates when descriptor families are mixed',
        srcset: 'https://example.com/wide.jpg 1200w, https://example.com/retina.jpg 2x',
        expected: 'https://example.com/wide.jpg',
    },
    {
        name: 'ignores a descriptorless fallback when width candidates are present',
        srcset: 'https://example.com/fallback.jpg, https://example.com/small.jpg 320w, https://example.com/large.jpg 1600w',
        expected: 'https://example.com/large.jpg',
    },
    {
        name: 'falls back to density candidates when no width candidates exist',
        srcset: 'https://example.com/fallback.jpg, https://example.com/retina.jpg 2x',
        expected: 'https://example.com/retina.jpg',
    },
    {
        name: 'promotes nothing when every candidate is malformed',
        srcset: 'https://example.com/broken.jpg nope, https://example.com/worse.jpg -5w',
        expected: null,
    },
    {
        name: 'does not split data URLs at their internal comma',
        srcset: `https://example.com/standard.jpg 1x, ${DATA_URL} 2x`,
        expected: DATA_URL,
    },
    {
        name: 'leaves promoted URL sanitization to DOMPurify',
        srcset: 'javascript:alert(1) 2x',
        expected: null,
    },
    // The next three cases pin the spec's in-parens descriptor state, where a comma between
    // parentheses does not end a candidate. Parentheses inside a URL are consumed before
    // descriptors are read, so only parentheses in the descriptor region reach that state.
    {
        name: 'keeps parentheses that belong to a candidate URL',
        srcset: 'image(1).jpg 2x, https://example.com/other.jpg 3x',
        expected: 'https://example.com/other.jpg',
    },
    {
        name: 'resumes splitting candidates after a balanced parenthesized descriptor',
        srcset: 'https://example.com/a.jpg 1x, https://example.com/b.jpg (2,3)x, https://example.com/c.jpg 3x',
        expected: 'https://example.com/c.jpg',
    },
    {
        name: 'treats an unclosed parenthesis as swallowing the remaining candidates',
        srcset: 'https://example.com/a.jpg 320w, https://example.com/b.jpg (x, https://example.com/c.jpg 640w',
        expected: 'https://example.com/a.jpg',
    },
    {
        name: 'ends the in-parens state at the first closing parenthesis',
        srcset: 'https://example.com/bad.jpg (x(y), https://example.com/good.jpg 2x',
        expected: 'https://example.com/good.jpg',
    },
];

/** <picture> cases, where the srcset that can rescue the image lives on a sibling <source>. */
interface PictureCase {
    readonly name: string;
    readonly html: string;
    readonly expected: string | null;
}

const PICTURE_CASES: readonly PictureCase[] = [
    {
        name: 'promotes a picture source when the image has no src or srcset',
        html: '<picture><source srcset="https://example.com/big.webp 1600w"><img alt="Hero"></picture>',
        expected: 'https://example.com/big.webp',
    },
    {
        name: 'uses the first picture source that yields a candidate',
        html: '<picture><source srcset="https://example.com/first.webp 800w"><source srcset="https://example.com/second.jpg 1600w"><img alt="Hero"></picture>',
        expected: 'https://example.com/first.webp',
    },
    {
        name: 'skips a picture source whose candidates are all malformed',
        html: '<picture><source srcset="https://example.com/broken.webp nope"><source srcset="https://example.com/usable.jpg 800w"><img alt="Hero"></picture>',
        expected: 'https://example.com/usable.jpg',
    },
    {
        name: 'prefers the image own srcset over a picture source',
        html: '<picture><source srcset="https://example.com/source.webp 1600w"><img alt="Hero" srcset="https://example.com/own.jpg 320w"></picture>',
        expected: 'https://example.com/own.jpg',
    },
    {
        name: 'keeps an existing image src ahead of any picture source',
        html: '<picture><source srcset="https://example.com/source.webp 1600w"><img alt="Hero" src="https://example.com/existing.jpg"></picture>',
        expected: 'https://example.com/existing.jpg',
    },
    {
        name: 'promotes nothing when no picture source yields a candidate',
        html: '<picture><source srcset="https://example.com/broken.webp nope"><img alt="Hero"></picture>',
        expected: null,
    },
    {
        name: 'ignores a picture source that follows the image',
        html: '<picture><img alt="Hero"><source srcset="https://example.com/late.jpg 2x"></picture>',
        expected: null,
    },
    {
        name: 'ignores a picture source nested inside another element',
        html: '<picture><span><source srcset="https://example.com/nested.jpg 2x"></span><img alt="Hero"></picture>',
        expected: null,
    },
    {
        name: 'uses a preceding picture source and ignores a following one',
        html: '<picture><source srcset="https://example.com/early.jpg 800w"><img alt="Hero"><source srcset="https://example.com/late.jpg 1600w"></picture>',
        expected: 'https://example.com/early.jpg',
    },
    {
        name: 'ignores picture sources when the picture is not the image direct parent',
        html: '<picture><source srcset="https://example.com/outer.jpg 2x"><span><img alt="Hero"></span></picture>',
        expected: null,
    },
];

/**
 * The promoted src, or null when nothing was promoted. An image left without a usable src is
 * removed as unrenderable, so a missing image also means no candidate was promoted.
 */
function promotedSrc(body: HTMLElement): string | null {
    return body.querySelector('img')?.getAttribute('src') ?? null;
}

describe('image srcset fallback promotion', () => {
    test('uses the largest width candidate when src is missing', async () => {
        const { markdown } = await convertHtmlToMarkdown(
            '<img alt="Hero" srcset="https://example.com/small.jpg 320w, https://example.com/large.jpg 1600w, https://example.com/medium.jpg 800w">',
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('![Hero](https://example.com/large.jpg)');
        expect(markdown).not.toContain('srcset');
    });

    test('uses the largest density candidate when src is blank', async () => {
        const result = await processHtml(
            '<img src="   " alt="Hero" srcset="https://example.com/standard.jpg, https://example.com/retina.jpg 2x, https://example.com/ultra.jpg 3x">',
            IMAGE_OPTIONS
        );

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('https://example.com/ultra.jpg');
        expect(result.body.querySelector('img')?.hasAttribute('srcset')).toBe(false);
    });

    test('keeps an existing src instead of replacing it with a srcset candidate', async () => {
        const result = await processHtml(
            '<img src="https://example.com/fallback.jpg" alt="Hero" srcset="https://example.com/large.jpg 1600w">',
            IMAGE_OPTIONS
        );

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('https://example.com/fallback.jpg');
    });

    test.each(SELECTION_CASES)('$name', async ({ srcset, expected }) => {
        const result = await processHtml(`<img alt="Hero" srcset="${srcset}">`, IMAGE_OPTIONS);

        expect(promotedSrc(result.body)).toBe(expected);
    });

    test.each(PICTURE_CASES)('$name', async ({ html, expected }) => {
        const result = await processHtml(html, IMAGE_OPTIONS);

        expect(promotedSrc(result.body)).toBe(expected);
    });

    test('does not retain images when image inclusion is disabled', async () => {
        const result = await processHtml(
            '<img alt="Hero" srcset="https://example.com/small.jpg 1x, https://example.com/large.jpg 2x">',
            pasteOptions({ includeImages: false })
        );

        expect(result.body.querySelector('img')).toBeNull();
    });
});
