import { describe, test, expect } from 'vitest';
import { convertHtmlToMarkdown } from '../markdownConverter';

async function toMarkdown(html: string, forceTightLists: boolean): Promise<string> {
    const { markdown } = await convertHtmlToMarkdown(html, {
        includeImages: true,
        convertImagesToResources: false,
        normalizeQuotes: true,
        forceTightLists,
    });
    return markdown.trim();
}

describe('Force tight lists (DOM preprocessing)', () => {
    describe('paragraph-wrapped list items', () => {
        test('unordered items become tight when enabled', async () => {
            const html = '<ul><li><p>One</p></li><li><p>Two</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- One\n- Two');
            expect(await toMarkdown(html, false)).toBe('- One\n\n- Two');
        });

        test('ordered items become tight when enabled', async () => {
            const html = '<ol><li><p>First</p></li><li><p>Second</p></li></ol>';

            expect(await toMarkdown(html, true)).toBe('1. First\n2. Second');
            expect(await toMarkdown(html, false)).toBe('1. First\n\n2. Second');
        });

        test('task list items become tight when enabled', async () => {
            const html = `<ul class="contains-task-list">
<li class="task-list-item enabled"><p><input class="task-list-item-checkbox" type="checkbox"> Do</p></li>
<li class="task-list-item enabled"><p><input class="task-list-item-checkbox" type="checkbox" checked> Done</p></li>
</ul>`;

            expect(await toMarkdown(html, true)).toBe('- [ ] Do\n- [x] Done');
        });

        test('blockquoted items become tight when enabled', async () => {
            const html = '<blockquote><ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul></blockquote>';

            expect(await toMarkdown(html, true)).toBe('> - Alpha\n> - Beta');
        });

        test('items already free of paragraph wrappers are unaffected', async () => {
            const html = '<ul><li>One</li><li>Two</li></ul>';

            expect(await toMarkdown(html, true)).toBe('- One\n- Two');
            expect(await toMarkdown(html, false)).toBe('- One\n- Two');
        });
    });

    describe('nested lists', () => {
        test('sub-list is tight against its parent item when enabled', async () => {
            const html = '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- One\n    - Nested\n- Two');
            expect(await toMarkdown(html, false)).toBe('- One\n\n    - Nested\n\n- Two');
        });

        test('deeply nested unordered lists stay tight at every level', async () => {
            const html =
                '<ul><li><p>One</p><ul><li><p>N1</p><ul><li><p>N2</p></li></ul></li><li><p>N3</p></li></ul></li><li><p>Two</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- One\n    - N1\n        - N2\n    - N3\n- Two');
        });

        test('nested ordered lists keep four-space indentation and numbering', async () => {
            const html = '<ol><li><p>First</p><ol><li><p>Sub</p></li></ol></li><li><p>Second</p></li></ol>';

            expect(await toMarkdown(html, true)).toBe('1. First\n    1. Sub\n2. Second');
        });
    });

    describe('adjacent sibling lists', () => {
        test('a run of single-item lists is merged when enabled', async () => {
            const html = '<ul><li><p>A</p></li></ul><ul><li><p>B</p></li></ul><ul><li><p>C</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- A\n- B\n- C');
            expect(await toMarkdown(html, false)).toBe('- A\n\n- B\n\n- C');
        });

        test('lists of different types are not merged', async () => {
            const html = '<ul><li><p>A</p></li></ul><ol><li><p>B</p></li></ol>';

            expect(await toMarkdown(html, true)).toBe('- A\n\n1. B');
        });

        test('lists separated by content are not merged', async () => {
            const html = '<ul><li><p>A</p></li></ul><p>text</p><ul><li><p>B</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- A\n\ntext\n\n- B');
        });

        test('lists separated by a horizontal rule are not merged', async () => {
            const html = '<ul><li>A</li></ul><hr><ul><li>B</li></ul>';

            expect(await toMarkdown(html, true)).toBe('- A\n\n* * *\n\n- B');
        });

        test('an ordered list with an explicit start is not absorbed', async () => {
            const html = '<ol><li>A</li></ol><ol start="5"><li>B</li></ol>';
            const document = new DOMParser().parseFromString(html, 'text/html');

            // The sanitizer strips `start`, so assert the guard at the pass level where it applies.
            const { mergeAdjacentLists } = await import('../html/post/lists');
            mergeAdjacentLists(document.body);

            expect(document.body.querySelectorAll('ol')).toHaveLength(2);
        });
    });

    describe('content that must stay loose', () => {
        test('multi-paragraph items keep their internal blank line', async () => {
            const html = '<ul><li><p>One a</p><p>One b</p></li><li><p>Two</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- One a\n\n    One b\n\n- Two');
        });

        test('a paragraph sharing the item with loose text is not unwrapped', async () => {
            const html = '<ul><li><p>Para</p> tail</li><li><p>Two</p></li></ul>';

            expect(await toMarkdown(html, true)).toBe('- Para\n\n    tail\n- Two');
        });

        test('fenced code inside an item is preserved', async () => {
            const html = '<ul><li><p>One</p><pre><code>a\n\nb</code></pre></li><li><p>Two</p></li></ul>';

            // The blank line inside the fence keeps its indentation: fenced regions are exempt
            // from the whitespace-only line cleanup so the code survives verbatim.
            expect(await toMarkdown(html, true)).toBe('- One\n\n    ```\n    a\n    \n    b\n    ```\n\n- Two');
        });
    });
});
