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
});
