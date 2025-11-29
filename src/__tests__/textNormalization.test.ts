import { describe, test, expect } from '@jest/globals';

import { processHtml } from '../html/processHtml';

describe('text normalization toggle', () => {
    test('does not normalize smart quotes when normalizeQuotes is false', async () => {
        const input = '<p>&#8220;Smart&#8221; and &#8216;quotes&#8217;</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        const html = body!.innerHTML;

        // Curly quotes should remain when normalization is disabled
        expect(html).toContain('\u201CSmart\u201D');
        expect(html).toContain('\u2018quotes\u2019');

        // And they should NOT be converted to straight quotes
        expect(html).not.toContain('"Smart"');
        expect(html).not.toContain("'quotes'");
    });

    test('normalizes smart quotes when normalizeQuotes is true', async () => {
        const input = '<p>&#8220;Smart&#8221; and &#8216;quotes&#8217;</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: true,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        const html = body!.innerHTML;

        // Curly quotes should be converted to straight quotes
        expect(html).toContain('"Smart"');
        expect(html).toContain("'quotes'");
        expect(/[\u201C\u201D\u2018\u2019]/.test(html)).toBe(false);
    });
});

describe('character normalization', () => {
    test('normalizes non-breaking spaces to regular spaces', async () => {
        const input = '<p>Hello\u00A0world&nbsp;test</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        expect(body!.textContent).toBe('Hello world test');
    });

    test('normalizes thin/narrow spaces to regular spaces', async () => {
        const input =
            '<p>Thin\u2009space\u200Ahair\u202Fnarrow\u2004three\u2005four\u2006six\u2007figure\u2008punct</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        expect(body!.textContent).toBe('Thin space hair narrow three four six figure punct');
    });

    test('removes zero-width characters', async () => {
        const input = '<p>Zero\u200Bwidth\u200C\u200Dtest\uFEFF\u2060word</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        expect(body!.textContent).toBe('Zerowidthtestword');
    });

    test('removes directional control characters', async () => {
        const input = '<p>Text\u2066with\u202Acontrols\u202C\u200Eand\u200Fmore\u061C</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        expect(body!.textContent).toBe('Textwithcontrolsandmore');
    });

    test('handles mixed character normalization', async () => {
        const input = '<p>Mixed\u00A0nbsp\u2009thin\u200Bzero\u2066dir</p>';
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        expect(body!.textContent).toBe('Mixed nbsp thinzerodir');
    });
});
