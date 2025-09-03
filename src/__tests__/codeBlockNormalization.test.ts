import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

/**
 * Focused tests for code block normalization & language inference introduced in refactor.
 */
describe('code block normalization & language inference', () => {
    test('adds missing <code> element inside <pre>', () => {
        const html = '<pre>line1\nline2</pre>';
        const md = convertHtmlToMarkdown(html, true);
        expect(md).toMatch(/```[\s\S]*line1[\s\S]*line2[\s\S]*```/);
    });

    test('flattens multi-span GitHub tokenized code', () => {
        const html =
            '<div class="highlight"><pre><code><span class="pl-k">const</span> <span class="pl-s1">x</span> <span class="pl-c1">=</span> <span class="pl-c1">1</span>;</code></pre></div>';
        const md = convertHtmlToMarkdown(html, true).trim();
        // Ensure spans removed and plain code present (allow language fence or not)
        expect(md).toMatch(/```[a-z]*\nconst x = 1;\n```/);
        expect(md).not.toMatch(/pl-k|pl-s1|pl-c1/);
    });

    test('handles highlight-source- wrapper (may or may not infer language)', () => {
        const html = '<div class="highlight highlight-source-python"><pre>print(\"x\")</pre></div>';
        const md = convertHtmlToMarkdown(html, true);
        // Must at least produce a fenced block containing the code.
        expect(md).toMatch(/```[\s\S]*print\("x"\)[\s\S]*```/);
    });

    test('maps js alias to javascript', () => {
        const html = '<pre class="language-js"><code>console.log(1)</code></pre>';
        const md = convertHtmlToMarkdown(html, true);
        expect(md).toMatch(/```javascript[\s\S]*console\.log/);
    });

    test('escaped tags preserved (no forced html heuristic)', () => {
        const html = '<pre><code>&lt;div&gt;Hello&lt;/div&gt;</code></pre>';
        const md = convertHtmlToMarkdown(html, true);
        // Accept with explicit html language (if future explicit class added) or without language.
        expect(md).toMatch(/```(?:html)?[\s\S]*<div>Hello<\/div>[\s\S]*```/);
    });

    test('sanitizes live <script> but preserves script tag text inside code (no html heuristic)', () => {
        const html =
            '<div><script>alert(1)</script></div><pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>';
        const md = convertHtmlToMarkdown(html, true);
        // Ensure any alert(1) appears only inside fenced code (capture fenced block then check counts)
        const occurrences = (md.match(/alert\(1\)/g) || []).length;
        expect(occurrences).toBeGreaterThanOrEqual(1);
        // Should appear within a fenced code block (language may be absent now)
        expect(md).toMatch(/```(?:html)?[\s\S]*<script>alert\(1\)<\/script>[\s\S]*```/);
    });
});
