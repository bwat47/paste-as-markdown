import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

/**
 * Verify style attributes and event handlers are stripped by sanitization.
 */
describe('sanitization: style & event handlers', () => {
    test('removes style and onclick, keeps safe content', async () => {
        const html =
            '<p style="color:red" onclick="alert(1)">Hello ' +
            '<strong style="font-weight:900" onmouseover="x()">World</strong></p>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toBe('Hello **World**');
        expect(md).not.toMatch(/style=|onclick=|onmouseover=/i);
    });
});
