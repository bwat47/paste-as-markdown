import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('<mark> highlight conversion', () => {
    test('simple mark', async () => {
        const html = '<p>Normal <mark>Highlighted</mark> Text</p>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        expect(markdown.trim()).toBe('Normal ==Highlighted== Text');
    });

    test('nested mark (sequential marks produce adjacent markers)', async () => {
        const html = '<p><mark>One <mark>Two</mark></mark></p>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        // Current rule applies independently; result contains adjacent markers around inner span.
        expect(markdown.trim()).toBe('==One ==Two====');
    });

    test('mark inside code should not appear because <code> wins', async () => {
        const html = '<p><code><mark>x</mark></code></p>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        // Code block neutralization removes markup so we just get inline code
        expect(markdown.trim()).toBe('`x`');
    });
});
