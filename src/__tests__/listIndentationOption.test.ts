import { parser } from '@lezer/markdown';
import { describe, expect, test } from 'vitest';
import { LIST_INDENTATION } from '../types';
import type { ListIndentation } from '../types';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';

async function toMarkdown(html: string, listIndentation: ListIndentation = LIST_INDENTATION.SPACES): Promise<string> {
    const { markdown } = await convertHtmlToMarkdown(html, { listIndentation });
    return markdown.trim();
}

describe('List indentation option', () => {
    test('uses four spaces by default', async () => {
        const html = '<ul><li>Parent<ul><li>Child</li></ul></li></ul>';

        expect(await toMarkdown(html)).toBe('- Parent\n    - Child');
    });

    test('uses one tab per unordered nesting level', async () => {
        const html = '<ul><li>Parent<ul><li>Child<ul><li>Grandchild</li></ul></li></ul></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- Parent\n\t- Child\n\t\t- Grandchild');
    });

    test('uses tabs for continuation blocks within list items', async () => {
        const html = '<ul><li><p>First paragraph</p><p>Second paragraph</p></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- First paragraph\n\n\tSecond paragraph');
    });

    test('uses tabs for nested task lists', async () => {
        const html = `<ul class="contains-task-list"><li class="task-list-item">
<input class="task-list-item-checkbox" type="checkbox"> Parent
<ul class="contains-task-list"><li class="task-list-item">
<input class="task-list-item-checkbox" type="checkbox" checked> Child
</li></ul></li></ul>`;

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- [ ] Parent\n\t- [x] Child');
    });

    test('uses enough tabs to preserve nesting after a wide ordered marker', async () => {
        const html = '<ol start="100"><li>Parent<ul><li>Child</li></ul></li></ol>';
        const markdown = await toMarkdown(html, LIST_INDENTATION.TABS);

        expect(markdown).toBe('100. Parent\n\t\t- Child');
        expect(parser.parse(markdown).toString()).toContain(
            'OrderedList(ListItem(ListMark,Paragraph,BulletList(ListItem(ListMark,Paragraph))))'
        );
    });

    test('preserves tab indentation inside fenced code in a list item', async () => {
        const html = '<ul><li><p>Parent</p><pre><code>a\n\nb</code></pre></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- Parent\n\n\t```\n\ta\n\t\n\tb\n\t```');
    });
});
