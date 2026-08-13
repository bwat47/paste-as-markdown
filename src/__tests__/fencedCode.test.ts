import { describe, expect, test } from 'vitest';
import { transformMarkdownOutsideFencedCode } from '../markdown/fencedCode';

const collapseBlankLines = (segment: string): string => segment.replace(/\n{3,}/g, '\n\n');

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
