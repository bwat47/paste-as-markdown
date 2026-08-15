import { describe, test, expect } from 'vitest';
import { convertHtmlToMarkdown } from './helpers/markdownConverter';

describe('literal HTML tag mentions in prose', () => {
    test('wraps <table>, <tr>, <th>, <td>, <li> mentions in inline code', async () => {
        const html = `
            <p>Combine lists and tables (using HTML &lt;table&gt;, &lt;tr&gt;, &lt;th&gt;, and &lt;td&gt;) to create side-by-side comparisons. Use list items (&lt;li&gt;) within table cells (&lt;td&gt;).</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html);
        // Ensure tokens are protected as inline code so Joplin does not interpret as HTML
        expect(md).toMatch(/`<table>`/);
        expect(md).toMatch(/`<tr>`/);
        expect(md).toMatch(/`<th>`/);
        expect(md).toMatch(/`<td>`/);
        expect(md).toMatch(/`<li>`/);
    });

    test('wraps <br>, <br/>, and <img ...> tokens with attributes as inline code', async () => {
        const html = `
            <p>Line break tags like &lt;br&gt; or &lt;br/&gt; are not paragraphs.</p>
            <p>Images like &lt;img src=\"test\"/&gt; or &lt;img src=\"test\" &gt; should be shown as text.</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html);
        expect(md).toContain('`<br>`');
        expect(md).toContain('`<br/>`');
        expect(md).toContain('`<img src="test"/>`');
        expect(md).toContain('`<img src="test" >`');
    });

    test('wraps arbitrary tag-like token in inline code', async () => {
        const html = '<p>This uses a placeholder tag like &lt;foo&gt; in text.</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html);
        expect(md).toMatch(/`<foo>`/);
    });
});
