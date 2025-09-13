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

    test('wraps <br>, <br/>, and <img ...> tokens with attributes as inline code', async () => {
        const html = `
            <p>Line break tags like &lt;br&gt; or &lt;br/&gt; are not paragraphs.</p>
            <p>Images like &lt;img src=\"test\"/&gt; or &lt;img src=\"test\" &gt; should be shown as text.</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        const brMatches = md.match(/`<br\s*(?:\/\s*)?\s*>(?=`)/g) ?? [];
        expect(brMatches.length).toBeGreaterThanOrEqual(2);
        const imgMatches = md.match(/`<img\s+src=\"test\"(?:\s*\/\s*)?\s*>`/g) ?? [];
        expect(imgMatches.length).toBeGreaterThanOrEqual(2);
    });

    test('wraps arbitrary tag-like token in inline code', async () => {
        const html = '<p>This uses a placeholder tag like &lt;foo&gt; in text.</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        expect(md).toMatch(/`<foo>`/);
    });
});
