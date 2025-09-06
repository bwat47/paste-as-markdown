import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('word alt normalization', () => {
    test('collapses line breaks in alt text from Word (&#10;)', async () => {
        const html = `
            <img width="625" height="284"
                 src="data:image/png;base64,iVBORw0KGgo="
                 alt="A computer screen shot of a program&#10;&#10;AI-generated content may be incorrect.">
        `;

        const { markdown } = await convertHtmlToMarkdown(html, true);

        // No newlines in output
        expect(markdown).not.toMatch(/\n/);
        // Sized images are emitted as raw HTML <img>; verify normalized alt attribute (single spaces) is present
        expect(markdown).toMatch(
            /<img[^>]*alt="A computer screen shot of a program AI-generated content may be incorrect\."/i
        );
        // Image src present
        expect(markdown).toMatch(/src="data:image\/png;base64,iVBORw0KGgo=/);
    });
});
