import { describe, expect, test } from 'vitest';
import { convertHtmlToMarkdown } from './helpers/pasteConversion';
import { pasteOptions } from './helpers/pasteOptions';

/** Resource conversion stays off so the assertions below see the original `src` values. */
const IMAGE_OPTIONS = pasteOptions({
    includeImages: true,
    convertImagesToResources: false,
});

const RENDERABLE_SOURCES = [
    'https://example.com/a.png',
    'http://example.com/a.png',
    'data:image/png;base64,AAAA',
    ':/0123456789abcdef0123456789abcdef',
];

const UNRENDERABLE_SOURCES = [
    '_images/a.png',
    '/static/a.png',
    '../a.png',
    'file:///C:/docs/a.png',
    'FILE:///home/user/a.png',
    'blob:https://example.com/1234',
    'cid:image001.png',
];

describe('unrenderable image removal', () => {
    test.each(RENDERABLE_SOURCES)('keeps an image with src %s', async (src) => {
        const { markdown } = await convertHtmlToMarkdown(`<p><img src="${src}" alt="Pic"></p>`, IMAGE_OPTIONS);

        expect(markdown).toBe(`![Pic](${src})`);
    });

    test.each(UNRENDERABLE_SOURCES)('drops an image with src %s', async (src) => {
        const { markdown } = await convertHtmlToMarkdown(
            `<p>Before <img src="${src}" alt="Pic"> after</p>`,
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('Before after');
    });

    test('drops an image without a src', async () => {
        const { markdown } = await convertHtmlToMarkdown('<p>Text<img alt="Pic"></p>', IMAGE_OPTIONS);

        expect(markdown).toBe('Text');
    });

    test.each([
        ['relative src', 'src="_images/a.png"'],
        ['missing src', ''],
    ])('drops a linked picture after removing its image (%s)', async (_label, src) => {
        const { markdown } = await convertHtmlToMarkdown(
            '<p>Before</p><a href="https://example.com/full.png">' +
                `<picture><source srcset="_images/a.webp 1x"><img ${src} alt="Pic"></picture>` +
                '</a><p>After</p>',
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('Before\n\nAfter');
    });

    test('keeps a linked picture with a renderable image', async () => {
        const { markdown } = await convertHtmlToMarkdown(
            '<a href="https://example.com/full.png"><picture>' +
                '<source srcset="https://example.com/a.webp 1x">' +
                '<img src="https://example.com/a.png" alt="Pic"></picture></a>',
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('[![Pic](https://example.com/a.png)](https://example.com/full.png)');
    });

    test('drops a relative Sphinx figure image and its link but keeps the caption', async () => {
        const html =
            '<figure id="id2" class="figure-padded align-default">' +
            '<a class="reference internal image-reference" href="_images/pack-objheader.png">' +
            '<img src="_images/pack-objheader.png" alt="The 49-byte RepoObj header." /></a>' +
            '<figcaption><p><span class="caption-text">The fixed 49-byte blob header.</span></p></figcaption>' +
            '</figure>';

        const { markdown } = await convertHtmlToMarkdown(html, IMAGE_OPTIONS);

        expect(markdown).toBe('The fixed 49-byte blob header.');
    });

    test('keeps a link that still has text after its image is dropped', async () => {
        const { markdown } = await convertHtmlToMarkdown(
            '<p><a href="https://example.com/page"><img src="_images/a.png" alt="Pic"> Details</a></p>',
            IMAGE_OPTIONS
        );

        expect(markdown).toBe('[Details](https://example.com/page)');
    });
});
