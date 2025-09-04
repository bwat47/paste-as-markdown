import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

// These tests exercise the real Turndown pipeline (no mocks) to validate
// combined behaviors that unit tests cover in isolation.

describe('integration: convertHtmlToMarkdown', () => {
    test('removes empty permalink anchors and unwraps heading links; preserves normal links', async () => {
        const html = `
            <h2>Title<a class="anchor" href="#title"></a></h2>
            <p>See <a href="https://example.com">example</a>.</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // No leading blank lines
        expect(md.startsWith('## Title')).toBe(true);
        // Anchor removed
        expect(md).not.toMatch(/anchor|\[#title\]|<a class="anchor"/i);
        // Normal link preserved as markdown link
        expect(md).toMatch(/\[example\]\(https:\/\/example\.com\)/);
    });

    test('strips picture/source/img when includeImages is false', async () => {
        const html = `
            <picture>
              <source srcset="hero@2x.png 2x" />
              <img src="hero.png" alt="Hero" />
            </picture>
            <p>After</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, false);
        // Image artifacts removed
        expect(md).not.toMatch(/!\[|<img|hero\.png/);
        // Content after still present
        expect(md).toMatch(/After/);
    });

    test('leading blank line trimming keeps internal paragraph spacing', async () => {
        const html = '<p>First para</p><p>Second para</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // No leading newline
        expect(md[0]).not.toBe('\n');
        // Two paragraphs separated by exactly one blank line when normalized
        const normalized = md.replace(/\n+$/, '');
        expect(normalized).toBe('First para\n\nSecond para');
    });

    test('normal link outside heading still converted when images excluded', async () => {
        const html = '<p>Visit <a href="https://example.org/path?q=1">Example</a> now.</p><img src="x.png" alt="X">';
        const { markdown: md } = await convertHtmlToMarkdown(html, false);
        expect(md).toMatch(/\[Example\]\(https:\/\/example\.org\/path\?q=1\)/);
        expect(md).not.toMatch(/x\.png/);
    });
    test('removes image-only anchor wrappers when images are excluded', async () => {
        const html = `
<div>
    <a href="https://example.com/image.png">
        <img src="https://example.com/image.png" alt="Hero" />
    </a>
</div>
`;
        const { markdown: withImages } = await convertHtmlToMarkdown(html, true);
        expect(withImages).toMatch(
            /\[!\[.*\]\(https:\/\/example\.com\/image\.png\)\]\(https:\/\/example\.com\/image\.png\)/
        );
        const { markdown: withoutImages } = await convertHtmlToMarkdown(html, false);
        expect(withoutImages).not.toMatch(/\[\]\(https:\/\/example\.com\/image\.png\)/);
        expect(withoutImages).not.toMatch(/!\[.*\]\(https:\/\/example\.com\/image\.png\)/);
    });

    test('converts runs of <br><br> to paragraph breaks while single <br> become hard breaks', async () => {
        const html = `
<span>A1</span><br><span>A2</span><br><br><span>B1</span><br><br><br><span>C1</span>
`;
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Expect sequence: A1 (hard break) A2 then paragraph breaks before B1 and C1.
        // Allow either single or multiple blank lines (Markdown renderer ignores extras).
        expect(md).toMatch(/A1\s{2}\nA2\s*\n+B1\s*\n+C1/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('single <br> becomes hard line break (two spaces + newline)', async () => {
        const html = '<span>First line</span><br><span>Second line</span>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Hard line break should be represented as two spaces before newline
        expect(md).toMatch(/First line  \nSecond line/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('collapses excessive blank lines from email div+br structure', async () => {
        const html = `
<div>Para 1 line</div><div><br></div><div><b>Para 2 start</b> rest of para</div>
`;
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Should have exactly one blank line between paragraphs (two newlines)
        expect(md).toMatch(/Para 1 line\n\n\*\*Para 2 start\*\* rest of para/);
        // No triple newline sequences remain
        expect(md).not.toMatch(/\n{3,}/);
    });

    test('preserves <br> literal inside inline code', async () => {
        const html = '<p>Example: <code>&lt;br&gt;</code> tag</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // The code span should still contain &lt;br&gt; (not converted to hard break or removed)
        expect(md).toMatch(/`<br>` tag/);
    });

    test('does not treat <br> inside fenced code block as hard/paragraph break outside code', async () => {
        const html = '<pre><code>Line 1<br>Line 2</code></pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Turndown converts <br> to a real newline inside code fences; ensure we have a fenced block with two lines, no double blank line inside.
        expect(md).toMatch(/```\nLine 1\nLine 2\n```/);
    });

    test('handles table cell content with consistent formatting', async () => {
        const html =
            '<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>A<br>B</td><td>C</td></tr></tbody></table>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // The GFM plugin handles all table cell processing, maintaining table structure
        expect(md).toMatch(/\|\s*Col1\s*\|\s*Col2\s*\|/); // Header row
        expect(md).toMatch(/\|\s*---\s*\|\s*---\s*\|/); // Separator row
        // Content should be present and table structure maintained
        expect(md).toContain('A');
        expect(md).toContain('B');
        expect(md).toContain('C');
        // Should be a complete table (no broken structure)
        const lines = md.split('\n');
        const tableLines = lines.filter((line) => line.includes('|'));
        expect(tableLines.length).toBeGreaterThanOrEqual(3); // Header, separator, data row
    });

    test('removes standalone &nbsp; placeholder paragraph from Outlook HTML', async () => {
        const html = `<!--StartFragment-->
<p class=MsoNormal><span style='font-size:11.0pt;color:black'>Test paragraph 1,<o:p></o:p></span></p>
<p class=MsoNormal><span style='font-size:11.0pt;color:black'><o:p>&nbsp;</o:p></span></p>
<p class=MsoNormal><span style='font-size:11.0pt;color:black'>Test paragraph 2<o:p></o:p></span></p>
<!--EndFragment-->`;
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).not.toMatch(/^&nbsp;$/m);
        expect(md).toMatch(/Test paragraph 1,\n\nTest paragraph 2/);
    });

    test('does not strip NBSP inside inline code', async () => {
        const html = '<p><code>&nbsp;</code></p>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/&nbsp;/);
    });

    test('does not strip NBSP-only line inside fenced code block', async () => {
        const html = '<pre><code>Line1\n&nbsp;\nLine3</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```[\s\S]*Line1[\s\S]*Line3[\s\S]*```/);
    });

    test('newline collapsing skips inside fenced code blocks', async () => {
        const html = '<pre><code>Line1\n\n\nLine2\n\n\n\nLine3</code></pre><p>After</p><p>More</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Inside fence keep 3+ newlines (at least one triple) intact
        const fenceMatch = md.match(/```[\s\S]*```/);
        expect(fenceMatch).toBeTruthy();
        if (fenceMatch) {
            // Expect original triple newline sequence still present
            expect(fenceMatch[0]).toMatch(/Line1\n\n\nLine2/);
        }
        // Outside fence sequences collapsed to a single blank line between paragraphs
        expect(md).toMatch(/Line3[\s\S]*After\n\nMore/);
        // Ensure no 3+ newline runs remain outside fences
        const outside = md.replace(/```[\s\S]*?```/g, '');
        expect(outside).not.toMatch(/\n{3,}/);
    });

    test('GitHub highlighted html code block preserved (language fence optional)', async () => {
        const html = `<!--StartFragment--><p>Browser:</p><div class="highlight highlight-text-html-basic"><pre><span>&lt;script src=\"https://unpkg.com/turndown/dist/turndown.js\"&gt;&lt;/script&gt;</span></pre></div><!--EndFragment-->`;
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Expect a fenced code block with unescaped script tag content; html language tag may be absent after heuristic removal.
        expect(md).toMatch(/Browser:/);
        expect(md).toMatch(
            /```(?:html)?[\s\S]*<script src=\"https:\/\/unpkg.com\/turndown\/dist\/turndown.js\"><\/script>[\s\S]*```/
        );
    });
});
