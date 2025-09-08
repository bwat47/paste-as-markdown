import { describe, test, expect } from '@jest/globals';

import { processHtml } from '../htmlProcessor';

describe('text normalization toggle', () => {
    test('does not normalize smart quotes when normalizeQuotes is false', async () => {
        const input = '<p>&#8220;Smart&#8221; and &#8216;quotes&#8217;</p>';
        const { html } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: false,
        });

        // Curly quotes should remain when normalization is disabled
        expect(html).toContain('“Smart”');
        expect(html).toContain('‘quotes’');

        // And they should NOT be converted to straight quotes
        expect(html).not.toContain('"Smart"');
        expect(html).not.toContain("'quotes'");
    });

    test('normalizes smart quotes when normalizeQuotes is true', async () => {
        const input = '<p>&#8220;Smart&#8221; and &#8216;quotes&#8217;</p>';
        const { html } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: true,
        });

        // Curly quotes should be converted to straight quotes
        expect(html).toContain('"Smart"');
        expect(html).toContain("'quotes'");
        expect(/[\u201C\u201D\u2018\u2019]/.test(html)).toBe(false);
    });
});
