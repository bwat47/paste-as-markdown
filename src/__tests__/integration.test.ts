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
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // No leading blank lines
        expect(md.startsWith('## Title')).toBe(true);
        // Anchor removed
        expect(md).not.toMatch(/anchor|\[#title\]|<a class="anchor"/i);
        // Normal link preserved as markdown link
        expect(md).toMatch(/\[example\]\(https:\/\/example\.com\)/);
    });

    test('unwraps anchors that wrap headings to avoid dangling brackets', async () => {
        const html = `
            <a href="https://example.com/heading" id="section-heading">
                <h2>Exported members</h2>
            </a>
        `;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();
        expect(md).toContain('## Exported members');
        expect(md).not.toMatch(/\[\s*\n*##/);
    });

    test('unwraps paragraph wrappers nested directly in headings', async () => {
        const html = `
            <div class="heading-wrapper" data-heading-level="h3">
                <h3 id="october-2025" class="heading-anchor">October 2025</h3>
            </div>
            <div class="heading-wrapper" data-heading-level="h4">
                <a class="anchor-link docon docon-link" href="https://learn.microsoft.com/en-us/windows/release-health/status-windows-11-25H2#iis-websites-might-fail-to-load" aria-label="Section titled: IIS websites might fail to load"></a>
                <h4 class="has-margin-left-none has-padding-left-none has-margin-top-none has-padding-top-none has-border-top heading-anchor" id="iis-websites-might-fail-to-load">
                    <p>IIS websites might fail to load</p>
                </h4>
            </div>
        `;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        expect(markdown).toMatch(/### October 2025/);
        expect(markdown).toMatch(/^#### IIS websites might fail to load$/m);
    });

    test('re-nests orphaned sub-lists to preserve numbering', async () => {
        const html = `
            <ol>
                <li>Primary step</li>
                <ul>
                    <li>Sub step A</li>
                    <li>Sub step B</li>
                </ul>
                <li>Next step</li>
            </ol>
        `;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const lines = markdown.trim().split(/\r?\n/);
        expect(lines[0]).toMatch(/^1\.\s+Primary step/);
        expect(lines[1]).toMatch(/^\s{4}-\s+Sub step A/);
        expect(lines[2]).toMatch(/^\s{4}-\s+Sub step B/);
        expect(lines[3]).toMatch(/^2\.\s+Next step/);
    });

    test('strips picture/source/img when includeImages is false', async () => {
        const html = `
            <picture>
              <source srcset="hero@2x.png 2x" />
              <img src="hero.png" alt="Hero" />
            </picture>
            <p>After</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: false });
        // Image artifacts removed
        expect(md).not.toMatch(/!\[|<img|hero\.png/);
        // Content after still present
        expect(md).toMatch(/After/);
    });

    test('leading blank line trimming keeps internal paragraph spacing', async () => {
        const html = '<p>First para</p><p>Second para</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // No leading newline
        expect(md[0]).not.toBe('\n');
        // Two paragraphs separated by exactly one blank line when normalized
        const normalized = md.replace(/\n+$/, '');
        expect(normalized).toBe('First para\n\nSecond para');
    });

    test('normalizes zero-width spaces in list items to standard spaces', async () => {
        const html = `
<p class="font-size-sm"><strong>Affected platforms:</strong></p>
<ul>
    <li class="font-size-sm">\u200BClient: Windows 11, version 25H2; Windows 11, version 24H2</li>
    <li class="font-size-sm">\u200BServer: Windows Server 2025</li>
</ul>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        expect(md).not.toMatch(/[\u200B\u200C\u200D\u2060\uFEFF]/);
        expect(md).toMatch(/\*\*Affected platforms:\*\*/);
        expect(md).toMatch(/^- Client: Windows 11, version 25H2; Windows 11, version 24H2$/m);
        expect(md).toMatch(/^- Server: Windows Server 2025$/m);
    });

    test('normal link outside heading still converted when images excluded', async () => {
        const html = '<p>Visit <a href="https://example.org/path?q=1">Example</a> now.</p><img src="x.png" alt="X">';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: false });
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
        const { markdown: withImages } = await convertHtmlToMarkdown(html, { includeImages: true });
        expect(withImages).toMatch(
            /\[!\[.*\]\(https:\/\/example\.com\/image\.png\)\]\(https:\/\/example\.com\/image\.png\)/
        );
        const { markdown: withoutImages } = await convertHtmlToMarkdown(html, { includeImages: false });
        expect(withoutImages).not.toMatch(/\[\]\(https:\/\/example\.com\/image\.png\)/);
        expect(withoutImages).not.toMatch(/!\[.*\]\(https:\/\/example\.com\/image\.png\)/);
    });

    test('converts runs of <br><br> to paragraph breaks while single <br> become hard breaks', async () => {
        const html = `
<span>A1</span><br><span>A2</span><br><br><span>B1</span><br><br><br><span>C1</span>
`;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // Expect sequence: A1 (hard break) A2 then paragraph breaks before B1 and C1.
        // Allow either single or multiple blank lines (Markdown renderer ignores extras).
        expect(md).toMatch(/A1\s{2}\nA2\s*\n+B1\s*\n+C1/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('single <br> becomes hard line break (two spaces + newline)', async () => {
        const html = '<span>First line</span><br><span>Second line</span>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // Hard line break should be represented as two spaces before newline
        expect(md).toMatch(/First line  \nSecond line/);
        expect(md).not.toMatch(/<br\/?/i);
    });

    test('collapses excessive blank lines from email div+br structure', async () => {
        const html = `
<div>Para 1 line</div><div><br></div><div><b>Para 2 start</b> rest of para</div>
`;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // Should have exactly one blank line between paragraphs (two newlines)
        expect(md).toMatch(/Para 1 line\n\n\*\*Para 2 start\*\* rest of para/);
        // No triple newline sequences remain
        expect(md).not.toMatch(/\n{3,}/);
    });

    test('preserves <br> literal inside inline code', async () => {
        const html = '<p>Example: <code>&lt;br&gt;</code> tag</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // The code span should still contain &lt;br&gt; (not converted to hard break or removed)
        expect(md).toMatch(/`<br>` tag/);
    });

    test('does not treat <br> inside fenced code block as hard/paragraph break outside code', async () => {
        const html = '<pre><code>Line 1<br>Line 2</code></pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
        // Turndown converts <br> to a real newline inside code fences; ensure we have a fenced block with two lines, no double blank line inside.
        expect(md).toMatch(/```\nLine 1\nLine 2\n```/);
    });

    test('handles table cell content with consistent formatting', async () => {
        const html =
            '<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>A<br>B</td><td>C</td></tr></tbody></table>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
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
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();
        expect(md).not.toMatch(/^&nbsp;$/m);
        expect(md).toMatch(/Test paragraph 1,\n\nTest paragraph 2/);
    });

    test('does not strip NBSP inside inline code', async () => {
        const html = '<p><code>&nbsp;</code></p>';
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();
        expect(md).toMatch(/&nbsp;/);
    });

    test('does not strip NBSP-only line inside fenced code block', async () => {
        const html = '<pre><code>Line1\n&nbsp;\nLine3</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();
        expect(md).toMatch(/```[\s\S]*Line1[\s\S]*Line3[\s\S]*```/);
    });

    test('newline collapsing skips inside fenced code blocks', async () => {
        const html = '<pre><code>Line1\n\n\nLine2\n\n\n\nLine3</code></pre><p>After</p><p>More</p>';
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });
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
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();
        // Expect a fenced code block with unescaped script tag content; html language tag may be absent after heuristic removal.
        expect(md).toMatch(/Browser:/);
        expect(md).toMatch(
            /```(?:html)?[\s\S]*<script src=\"https:\/\/unpkg.com\/turndown\/dist\/turndown.js\"><\/script>[\s\S]*```/
        );
    });

    test('unwraps block-level elements from anchors to prevent newlines in link syntax', async () => {
        const html = `
            <div>
                <a href="https://about.gitlab.com/blog/tags/security/">
                    <p>security</p>
                </a>
                <a href="https://about.gitlab.com/blog/tags/security-research/">
                    <p>security research</p>
                </a>
            </div>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });

        // Links should be on single lines without dangling brackets
        expect(md).toContain('[security](https://about.gitlab.com/blog/tags/security/)');
        expect(md).toContain('[security research](https://about.gitlab.com/blog/tags/security-research/)');

        // Should not have newlines inside link syntax
        expect(md).not.toMatch(/\[\s*\n/);
        expect(md).not.toMatch(/\n\s*\]\(/);
    });

    test('code blocks with special replacement patterns ($`, $&, etc.) do not cause content duplication', async () => {
        // Regression test for bug where JavaScript's String.replace() special patterns in code blocks
        // would cause content before the code block to be duplicated inside it.
        // The pattern `$`` means "insert everything before the matched substring" in replacement strings.
        const html = `
            <h3>Build automation workflow</h3>
            <p>The deployment script performs these steps:</p>
            <ol>
                <li>Validates the package configuration</li>
                <li>Runs the test suite with <code>npm test</code></li>
                <li>Builds the production bundle</li>
                <li>Increments the version number</li>
                <li>Publishes to the package registry</li>
            </ol>
            <pre><code>async function deployPackage(config) {
  // Validate configuration
  const isValid = await validateConfig(config);

  // Deploy using Bun's shell
  await Bun.$\`npm publish \${config.packagePath}\`.env({
    NODE_ENV: 'production'
  });
}</code></pre>
            <h2>Post-deployment tasks</h2>
            <p>After deployment completes, update the changelog and notify the team.</p>
        `;
        const { markdown: md } = await convertHtmlToMarkdown(html, { includeImages: true });

        // The code block should appear exactly once
        const codeBlockMatches = md.match(/```[\s\S]*?```/g);
        expect(codeBlockMatches).toHaveLength(1);

        // The heading and list should NOT appear inside the code block
        const codeBlock = codeBlockMatches![0];
        expect(codeBlock).not.toContain('Build automation workflow');
        expect(codeBlock).not.toContain('Validates the package');
        expect(codeBlock).not.toContain('Runs the test suite');

        // The code block should contain the actual code with Bun.$`
        expect(codeBlock).toContain('await Bun.$`npm publish');
        expect(codeBlock).toContain("NODE_ENV: 'production'");

        // The heading and list should appear in the correct positions outside the code block
        expect(md).toMatch(/### Build automation workflow/);
        expect(md).toMatch(/1\. Validates the package configuration/);
        expect(md).toMatch(/## Post-deployment tasks/);

        // The heading should appear exactly once (not duplicated)
        const headingMatches = md.match(/### Build automation workflow/g);
        expect(headingMatches).toHaveLength(1);
    });
});
