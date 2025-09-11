import { describe, test, expect } from '@jest/globals';
import { processHtml } from '../htmlProcessor';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('smart quotes normalization with large code block present', () => {
    test('normalizes curly quotes in top paragraph even when selection includes a big code block', async () => {
        const input = readFileSync(join(__dirname, 'clipboard_export.html'), 'utf8');
        const { html } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: true,
        });

        // Expect the “Copy as HTML / Plain Text” phrase to be normalized to straight quotes.
        // We look for any occurrence of the phrase with straight quotes in the sanitized output.
        expect(html.includes('"Copy as HTML / Plain Text"')).toBe(true);

        // And ensure curly quotes no longer appear in that phrase.
        expect(/“Copy as HTML \/ Plain Text”/.test(html)).toBe(false);
    });
});
