import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('Force tight lists (markdown post-processing)', () => {
    test('unordered simple items become tight when enabled', async () => {
        const html = '<ul><li><p>One</p></li><li><p>Two</p></li></ul>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true, false, true, true);
        const normalized = md.trim();
        // Expect no blank line between list items
        expect(normalized).toMatch(/^-\s+One\n-\s+Two$/m);
        expect(normalized).not.toMatch(/^-\s+One\n\n-\s+Two$/m);
    });

    test('ordered simple items become tight when enabled', async () => {
        const html = '<ol><li><p>First</p></li><li><p>Second</p></li></ol>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true, false, true, true);
        const normalized = md.trim();
        expect(normalized).toMatch(/^1[.)]\s+First\n2[.)]\s+Second$/m);
        expect(normalized).not.toMatch(/^1[.)]\s+First\n\n2[.)]\s+Second$/m);
    });

    test('task list items become tight when enabled', async () => {
        const html = `<ul class="contains-task-list">
<li class="task-list-item enabled"><input class="task-list-item-checkbox" type="checkbox"> Do</li>
<li class="task-list-item enabled"><input class="task-list-item-checkbox" type="checkbox" checked> Done</li>
</ul>`;
        const { markdown: md } = await convertHtmlToMarkdown(html, true, false, true, true);
        const normalized = md.trim();
        expect(normalized).toMatch(/^-\s+\[ \]\s+Do\n-\s+\[x\]\s+Done$/m);
        expect(normalized).not.toMatch(/^-\s+\[ \]\s+Do\n\n-\s+\[x\]\s+Done$/m);
    });
});
