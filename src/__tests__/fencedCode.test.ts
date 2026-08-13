import { describe, expect, test } from 'vitest';
import { transformMarkdownOutsideFencedCode } from '../markdown/fencedCode';

const collapseBlankLines = (segment: string): string => segment.replace(/\n{3,}/g, '\n\n');

// Mirrors the cleanup in markdownConverter: strips whitespace-only lines before collapsing.
const cleanupSegment = (segment: string): string => collapseBlankLines(segment.replace(/^[ \t]+$/gm, ''));

describe('transformMarkdownOutsideFencedCode', () => {
    test('preserves variable-length backtick fences while transforming surrounding text', () => {
        const markdown = 'Before\n\n\n\n````\n```\nfoo\n\n\n\nbar\n```\n````\n\n\n\nAfter';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe(
            'Before\n\n````\n```\nfoo\n\n\n\nbar\n```\n````\n\nAfter'
        );
    });

    test('recognizes fences in list and blockquote containers', () => {
        const markdown =
            '> - ````\n>     ```\n>     foo\n>     \n>     \n>     bar\n>     ```\n>     ````\n\n\n\nAfter';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe(
            '> - ````\n>     ```\n>     foo\n>     \n>     \n>     bar\n>     ```\n>     ````\n\nAfter'
        );
    });

    // Turndown emits this shape for `<li><p>foo</p><pre><code>...`. The fence opens on its own
    // indentation-only prefix, so a range starting at the delimiter would leave that prefix in the
    // preceding segment, where the whitespace-only line strip would delete it and unnest the fence.
    test('preserves indentation on a fence opening line inside a list item', () => {
        const markdown = '- foo\n\n    ```\n    a\n    \n    \n    \n    b\n    ```';

        expect(transformMarkdownOutsideFencedCode(markdown, cleanupSegment)).toBe(markdown);
    });

    test('transforms every gap between multiple fenced blocks', () => {
        const markdown = '```\nfoo\n```\n\n\n\nBetween\n\n\n\n```\nbar\n```\n```\nbaz\n```\n\n\n\nAfter';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe(
            '```\nfoo\n```\n\nBetween\n\n```\nbar\n```\n```\nbaz\n```\n\nAfter'
        );
    });

    test('supports tilde fences and closing fences longer than the opener', () => {
        const markdown = '~~~text\nfoo\n\n\n\nbar\n~~~~~\n\n\n\nAfter';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe(
            '~~~text\nfoo\n\n\n\nbar\n~~~~~\n\nAfter'
        );
    });

    test.each(['    ', '\t'])('does not mistake a %j-indented delimiter for a closing fence', (indent) => {
        const markdown = `\`\`\`\n${indent}\`\`\`\nfoo\n\n\n\nbar\n\`\`\`\n\n\n\nAfter`;

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe(
            `\`\`\`\n${indent}\`\`\`\nfoo\n\n\n\nbar\n\`\`\`\n\nAfter`
        );
    });

    test('protects an unclosed fence through the end of the document', () => {
        const markdown = 'Before\n\n\n\n```\nfoo\n\n\n\nbar';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe('Before\n\n```\nfoo\n\n\n\nbar');
    });

    test('does not treat an inline delimiter run as a fence', () => {
        const markdown = 'Text ``` inline\n\n\n\nAfter';

        expect(transformMarkdownOutsideFencedCode(markdown, collapseBlankLines)).toBe('Text ``` inline\n\nAfter');
    });
});
