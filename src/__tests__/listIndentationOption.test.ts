import { parser } from '@lezer/markdown';
import { describe, expect, test } from 'vitest';
import { LIST_INDENTATION } from '../types';
import type { ListIndentation } from '../types';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';

async function toMarkdown(html: string, listIndentation?: ListIndentation): Promise<string> {
    const options = listIndentation === undefined ? {} : { listIndentation };
    const { markdown } = await convertHtmlToMarkdown(html, options);
    return markdown.trim();
}

describe('List indentation option', () => {
    test('uses tabs by default', async () => {
        const html = '<ul><li>Parent<ul><li>Child</li></ul></li></ul>';

        expect(await toMarkdown(html)).toBe('- Parent\n\t- Child');
    });

    test('uses four spaces when selected', async () => {
        const html = '<ul><li>Parent<ul><li>Child</li></ul></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.SPACES)).toBe('- Parent\n    - Child');
    });

    test('indents one level per unordered nesting level', async () => {
        const html = '<ul><li>Parent<ul><li>Child<ul><li>Grandchild</li></ul></li></ul></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- Parent\n\t- Child\n\t\t- Grandchild');
        expect(await toMarkdown(html, LIST_INDENTATION.SPACES)).toBe('- Parent\n    - Child\n        - Grandchild');
    });

    test('indents continuation blocks within list items', async () => {
        const html = '<ul><li><p>First paragraph</p><p>Second paragraph</p></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- First paragraph\n\n\tSecond paragraph');
        expect(await toMarkdown(html, LIST_INDENTATION.SPACES)).toBe('- First paragraph\n\n    Second paragraph');
    });

    test('indents nested task lists', async () => {
        const html = `<ul class="contains-task-list"><li class="task-list-item">
<input class="task-list-item-checkbox" type="checkbox"> Parent
<ul class="contains-task-list"><li class="task-list-item">
<input class="task-list-item-checkbox" type="checkbox" checked> Child
</li></ul></li></ul>`;

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- [ ] Parent\n\t- [x] Child');
        expect(await toMarkdown(html, LIST_INDENTATION.SPACES)).toBe('- [ ] Parent\n    - [x] Child');
    });

    test('indents enough to preserve nesting after a wide ordered marker', async () => {
        const html = '<ol start="100"><li>Parent<ul><li>Child</li></ul></li></ol>';
        const nestedStructure = 'OrderedList(ListItem(ListMark,Paragraph,BulletList(ListItem(ListMark,Paragraph))))';

        // Tabs advance to four-column stops, so the five-column `100. ` marker rounds up to two tabs.
        const tabbed = await toMarkdown(html, LIST_INDENTATION.TABS);
        expect(tabbed).toBe('100. Parent\n\t\t- Child');
        expect(parser.parse(tabbed).toString()).toContain(nestedStructure);

        // Spaces match the marker width exactly rather than rounding.
        const spaced = await toMarkdown(html, LIST_INDENTATION.SPACES);
        expect(spaced).toBe('100. Parent\n     - Child');
        expect(parser.parse(spaced).toString()).toContain(nestedStructure);
    });

    test('preserves indentation inside fenced code in a list item', async () => {
        const html = '<ul><li><p>Parent</p><pre><code>a\n\nb</code></pre></li></ul>';

        expect(await toMarkdown(html, LIST_INDENTATION.TABS)).toBe('- Parent\n\n\t```\n\ta\n\t\n\tb\n\t```');
        expect(await toMarkdown(html, LIST_INDENTATION.SPACES)).toBe(
            '- Parent\n\n    ```\n    a\n    \n    b\n    ```'
        );
    });
});
