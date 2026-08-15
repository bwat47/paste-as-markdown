import { describe, expect, test } from 'vitest';
import { processHtml } from '../html/processHtml';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';
import { pasteOptions } from './helpers/pasteOptions';

const IMAGE_OPTIONS = pasteOptions({
    includeImages: true,
    convertImagesToResources: false,
});

const DATA_URL = 'data:image/png;base64,AAAA';

/** Candidate selection cases: the srcset of a src-less image, and the src it should promote. */
interface SelectionCase {
    readonly name: string;
    readonly srcset: string;
    /** Null when no candidate is promotable and the image must be left without a src. */
    readonly expected: string | null;
}

const SELECTION_CASES: readonly SelectionCase[] = [
    {
        name: 'ignores malformed candidates while selecting from valid comparable candidates',
        srcset: 'broken.jpg nope, medium.jpg 800w, large.jpg 1200w',
        expected: 'large.jpg',
    },
    {
        name: 'rejects uppercase descriptor units',
        srcset: 'retina.jpg 2X, wide.jpg 320W',
        expected: null,
    },
    {
        name: 'accepts either case for the density exponent marker',
        srcset: 'small.jpg 1x, big.jpg 1E1x',
        expected: 'big.jpg',
    },
    {
        name: 'prefers width candidates over density candidates when descriptor families are mixed',
        srcset: 'wide.jpg 1200w, retina.jpg 2x',
        expected: 'wide.jpg',
    },
    {
        name: 'ignores a descriptorless fallback when width candidates are present',
        srcset: 'fallback.jpg, small.jpg 320w, large.jpg 1600w',
        expected: 'large.jpg',
    },
    {
        name: 'falls back to density candidates when no width candidates exist',
        srcset: 'fallback.jpg, retina.jpg 2x',
        expected: 'retina.jpg',
    },
    {
        name: 'promotes nothing when every candidate is malformed',
        srcset: 'broken.jpg nope, worse.jpg -5w',
        expected: null,
    },
    {
        name: 'does not split data URLs at their internal comma',
        srcset: `standard.jpg 1x, ${DATA_URL} 2x`,
        expected: DATA_URL,
    },
    {
        name: 'leaves promoted URL sanitization to DOMPurify',
        srcset: 'javascript:alert(1) 2x',
        expected: null,
    },
];

describe('image srcset fallback promotion', () => {
    test('uses the largest width candidate when src is missing', async () => {
        const { markdown } = await convertHtmlToMarkdown(
            '<img alt="Hero" srcset="small.jpg 320w, large.jpg 1600w, medium.jpg 800w">',
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('![Hero](large.jpg)');
        expect(markdown).not.toContain('srcset');
    });

    test('uses the largest density candidate when src is blank', async () => {
        const result = await processHtml(
            '<img src="   " alt="Hero" srcset="standard.jpg, retina.jpg 2x, ultra.jpg 3x">',
            IMAGE_OPTIONS
        );

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('ultra.jpg');
        expect(result.body.querySelector('img')?.hasAttribute('srcset')).toBe(false);
    });

    test('keeps an existing src instead of replacing it with a srcset candidate', async () => {
        const result = await processHtml('<img src="fallback.jpg" alt="Hero" srcset="large.jpg 1600w">', IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('fallback.jpg');
    });

    test.each(SELECTION_CASES)('$name', async ({ srcset, expected }) => {
        const result = await processHtml(`<img alt="Hero" srcset="${srcset}">`, IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe(expected);
    });

    test('does not retain images when image inclusion is disabled', async () => {
        const result = await processHtml(
            '<img alt="Hero" srcset="small.jpg 1x, large.jpg 2x">',
            pasteOptions({ includeImages: false })
        );

        expect(result.body.querySelector('img')).toBeNull();
    });
});
