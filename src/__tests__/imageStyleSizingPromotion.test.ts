import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('image sizing: promote style to attributes (pre-sanitize)', () => {
    test('style-only width/height promoted to attributes and preserved as HTML', async () => {
        const html = '<p><img src="x.png" alt="Alt" style="width: 120px; height: 50px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" width="120" height="50">');
        expect(markdown).not.toMatch(/!\[Alt\]\(x\.png\)/); // not markdown image
        expect(markdown).not.toMatch(/style=/); // style removed
    });

    test('existing height attribute prevents promotion from style; style removed', async () => {
        const html = '<p><img src="x.png" alt="Alt" height="90" style="width: 120px; height: 50px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" height="90">');
        expect(markdown).not.toMatch(/width=\"120\"/); // width not copied from style
        expect(markdown).not.toMatch(/style=/); // style removed
        expect(markdown).not.toMatch(/!\[Alt\]\(x\.png\)/);
    });

    test('existing width attribute prevents promotion from style; style removed', async () => {
        const html = '<p><img src="x.png" alt="Alt" width="120" style="width: 120px; height: 50px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" width="120">');
        expect(markdown).not.toMatch(/height=\"50\"/); // height not copied from style
        expect(markdown).not.toMatch(/style=/); // style removed
    });

    test('style-only width promoted to width attribute; style removed', async () => {
        const html = '<p><img src="x.png" alt="Alt" style="width: 200px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" width="200">');
        expect(markdown).not.toMatch(/height=\"/);
        expect(markdown).not.toMatch(/!\[Alt\]\(x\.png\)/);
        expect(markdown).not.toMatch(/style=/);
    });

    test('style-only height promoted to height attribute; style removed', async () => {
        const html = '<p><img src="x.png" alt="Alt" style="height: 75px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" height="75">');
        expect(markdown).not.toMatch(/width=\"/);
        expect(markdown).not.toMatch(/!\[Alt\]\(x\.png\)/);
        expect(markdown).not.toMatch(/style=/);
    });

    test('style width of 0px is ignored while height is retained', async () => {
        const html = '<p><img src="x.png" alt="Alt" style="width: 0px; height: 328px;"></p>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            convertImagesToResources: false,
        });
        expect(markdown).toContain('<img src="x.png" alt="Alt" height="328">');
        expect(markdown).not.toMatch(/width=\"0\"/);
        expect(markdown).not.toMatch(/width=\"/);
        expect(markdown).not.toMatch(/style=/);
    });
});
