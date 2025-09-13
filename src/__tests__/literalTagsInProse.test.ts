import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('literal HTML tag mentions in prose', () => {
    test('wraps <table>, <tr>, <th>, <td>, <li> mentions in inline code', async () => {
        const html = `
            <p>Combine lists and tables (using HTML &lt;table&gt;, &lt;tr&gt;, &lt;th&gt;, and &lt;td&gt;) to create side-by-side comparisons. Use list items (&lt;li&gt;) within table cells (&lt;td&gt;).</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Ensure tokens are protected as inline code so Joplin does not interpret as HTML
        expect(md).toMatch(/`<table>`/);
        expect(md).toMatch(/`<tr>`/);
        expect(md).toMatch(/`<th>`/);
        expect(md).toMatch(/`<td>`/);
        expect(md).toMatch(/`<li>`/);
    });
});

