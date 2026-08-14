import { describe, test, expect } from 'vitest';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';

describe('<mark> highlight conversion', () => {
    test.each([
        {
            name: 'simple mark',
            html: '<p>Normal <mark>Highlighted</mark> Text</p>',
            expected: 'Normal ==Highlighted== Text',
        },
        {
            name: 'nested mark (sequential marks produce adjacent markers)',
            html: '<p><mark>One <mark>Two</mark></mark></p>',
            expected: '==One ==Two====',
        },
        {
            name: 'mark inside code should not appear because <code> wins',
            html: '<p><code><mark>x</mark></code></p>',
            expected: '`x`',
        },
    ])('$name', async ({ html, expected }) => {
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        expect(markdown.trim()).toBe(expected);
    });
});
