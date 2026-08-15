import { describe, expect, test } from 'vitest';
import { processHtml } from '../html/processHtml';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';
import { pasteOptions } from './helpers/pasteOptions';

const IMAGE_OPTIONS = pasteOptions({
    includeImages: true,
    convertImagesToResources: false,
});

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

    test('ignores malformed candidates while selecting from valid comparable candidates', async () => {
        const result = await processHtml(
            '<img alt="Hero" srcset="broken.jpg nope, medium.jpg 800w, large.jpg 1200w">',
            IMAGE_OPTIONS
        );

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('large.jpg');
    });

    test('prefers width candidates over density candidates when descriptor families are mixed', async () => {
        const result = await processHtml('<img alt="Hero" srcset="wide.jpg 1200w, retina.jpg 2x">', IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('wide.jpg');
    });

    test('ignores a descriptorless fallback when width candidates are present', async () => {
        const result = await processHtml(
            '<img alt="Hero" srcset="fallback.jpg, small.jpg 320w, large.jpg 1600w">',
            IMAGE_OPTIONS
        );

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('large.jpg');
    });

    test('falls back to density candidates when no width candidates exist', async () => {
        const result = await processHtml('<img alt="Hero" srcset="fallback.jpg, retina.jpg 2x">', IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe('retina.jpg');
    });

    test('promotes nothing when every candidate is malformed', async () => {
        const result = await processHtml('<img alt="Hero" srcset="broken.jpg nope, worse.jpg -5w">', IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.hasAttribute('src')).toBe(false);
    });

    test('does not split data URLs at their internal comma', async () => {
        const dataUrl = 'data:image/png;base64,AAAA';
        const result = await processHtml(`<img alt="Hero" srcset="standard.jpg 1x, ${dataUrl} 2x">`, IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.getAttribute('src')).toBe(dataUrl);
    });

    test('leaves promoted URL sanitization to DOMPurify', async () => {
        const result = await processHtml('<img alt="Hero" srcset="javascript:alert(1) 2x">', IMAGE_OPTIONS);

        expect(result.body.querySelector('img')?.hasAttribute('src')).toBe(false);
    });

    test('does not retain images when image inclusion is disabled', async () => {
        const result = await processHtml(
            '<img alt="Hero" srcset="small.jpg 1x, large.jpg 2x">',
            pasteOptions({ includeImages: false })
        );

        expect(result.body.querySelector('img')).toBeNull();
    });
});
