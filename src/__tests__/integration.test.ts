import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

// These tests exercise the real Turndown pipeline (no mocks) to validate
// combined behaviors that unit tests cover in isolation.

describe('integration: convertHtmlToMarkdown', () => {
    test('removes empty permalink anchors and unwraps heading links; preserves normal links', () => {
        const html = `
            <h2>Title<a class="anchor" href="#title"></a></h2>
            <p>See <a href="https://example.com">example</a>.</p>
        `;
        const md = convertHtmlToMarkdown(html, true);
        // No leading blank lines
        expect(md.startsWith('## Title')).toBe(true);
        // Anchor removed
        expect(md).not.toMatch(/anchor|\[#title\]|<a class="anchor"/i);
        // Normal link preserved as markdown link
        expect(md).toMatch(/\[example\]\(https:\/\/example\.com\)/);
    });

    test('strips picture/source/img when includeImages is false', () => {
        const html = `
            <picture>
              <source srcset="hero@2x.png 2x" />
              <img src="hero.png" alt="Hero" />
            </picture>
            <p>After</p>
        `;
        const md = convertHtmlToMarkdown(html, false);
        // Image artifacts removed
        expect(md).not.toMatch(/!\[|<img|hero\.png/);
        // Content after still present
        expect(md).toMatch(/After/);
    });

    test('leading blank line trimming keeps internal paragraph spacing', () => {
        const html = '<p>First para</p><p>Second para</p>';
        const md = convertHtmlToMarkdown(html, true);
        // No leading newline
        expect(md[0]).not.toBe('\n');
        // Two paragraphs separated by exactly one blank line when normalized
        const normalized = md.replace(/\n+$/, '');
        expect(normalized).toBe('First para\n\nSecond para');
    });

    test('normal link outside heading still converted when images excluded', () => {
        const html = '<p>Visit <a href="https://example.org/path?q=1">Example</a> now.</p><img src="x.png" alt="X">';
        const md = convertHtmlToMarkdown(html, false);
        expect(md).toMatch(/\[Example\]\(https:\/\/example\.org\/path\?q=1\)/);
        expect(md).not.toMatch(/x\.png/);
    });
    test('removes image-only anchor wrappers when images are excluded', () => {
        const html = `
<div>
    <a href="https://example.com/image.png">
        <img src="https://example.com/image.png" alt="Hero" />
    </a>
</div>
`;
        const withImages = convertHtmlToMarkdown(html, true);
        expect(withImages).toMatch(
            /\[!\[.*\]\(https:\/\/example\.com\/image\.png\)\]\(https:\/\/example\.com\/image\.png\)/
        );
        const withoutImages = convertHtmlToMarkdown(html, false);
        expect(withoutImages).not.toMatch(/\[\]\(https:\/\/example\.com\/image\.png\)/);
        expect(withoutImages).not.toMatch(/!\[.*\]\(https:\/\/example\.com\/image\.png\)/);
    });

    test('converts runs of <br><br> to paragraph breaks while single <br> become hard breaks', () => {
        const html = `
<span>A1</span><br><span>A2</span><br><br><span>B1</span><br><br><br><span>C1</span>
`;
        const md = convertHtmlToMarkdown(html, true);
        // Expect sequence: A1 (hard break) A2 then paragraph breaks before B1 and C1.
        // Allow either single or multiple blank lines (Markdown renderer ignores extras).
        expect(md).toMatch(/A1\s{2}\nA2\s*\n+B1\s*\n+C1/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('single <br> becomes hard line break (two spaces + newline)', () => {
        const html = '<span>First line</span><br><span>Second line</span>';
        const md = convertHtmlToMarkdown(html, true);
        // Hard line break should be represented as two spaces before newline
        expect(md).toMatch(/First line  \nSecond line/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('collapses excessive blank lines from email div+br structure', () => {
        const html = `
<div>Para 1 line</div><div><br></div><div><b>Para 2 start</b> rest of para</div>
`;
        const md = convertHtmlToMarkdown(html, true);
        // Should have exactly one blank line between paragraphs (two newlines)
        expect(md).toMatch(/Para 1 line\n\n\*\*Para 2 start\*\* rest of para/);
        // No triple newline sequences remain
        expect(md).not.toMatch(/\n{3,}/);
    });

    test('preserves <br> literal inside inline code', () => {
        const html = '<p>Example: <code>&lt;br&gt;</code> tag</p>';
        const md = convertHtmlToMarkdown(html, true);
        // The code span should still contain &lt;br&gt; (not converted to hard break or removed)
        expect(md).toMatch(/`<br>` tag/);
    });

    test('does not treat <br> inside fenced code block as hard/paragraph break outside code', () => {
        const html = '<pre><code>Line 1<br>Line 2</code></pre>';
        const md = convertHtmlToMarkdown(html, true);
        // Turndown converts <br> to a real newline inside code fences; ensure we have a fenced block with two lines, no double blank line inside.
        expect(md).toMatch(/```\nLine 1\nLine 2\n```/);
    });

    test('preserves <br> inside markdown table cells', () => {
        const html =
            '<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>A<br>B</td><td>C</td></tr></tbody></table>';
        const md = convertHtmlToMarkdown(html, true);
        // Expect a markdown table where the A<br>B remains inside the cell (not converted to hard/paragraph breaks)
        // Implementation may keep literal <br> or convert to newline depending on turndown; ensure no paragraph break inserted.
        // Accept either literal <br> or single hard break representation (two spaces + newline) within the same cell line.
        // Accept A <br>B with optional spaces before <br>
        expect(md).toMatch(/\|\s*Col1\s*\|\s*Col2\s*\|[\s\S]*\|\s*A\s*<br>B\s*\|/);
    });
});
