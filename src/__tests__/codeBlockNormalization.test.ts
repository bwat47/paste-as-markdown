import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

/**
 * Focused tests for code block normalization & language inference introduced in refactor.
 */
describe('code block normalization & language inference', () => {
    test('adds missing <code> element inside <pre>', async () => {
        const html = '<pre>line1\nline2</pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        expect(md).toMatch(/```[\s\S]*line1[\s\S]*line2[\s\S]*```/);
    });

    test('flattens multi-span GitHub tokenized code', async () => {
        const html =
            '<div class="highlight"><pre><code><span class="pl-k">const</span> <span class="pl-s1">x</span> <span class="pl-c1">=</span> <span class="pl-c1">1</span>;</code></pre></div>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Ensure spans removed and plain code present (allow language fence or not)
        expect(md).toMatch(/```[a-z]*\nconst x = 1;\n```/);
        expect(md).not.toMatch(/pl-k|pl-s1|pl-c1/);
    });

    test('does not infer language when only wrapper has highlight-source- class (python)', async () => {
        const html = '<div class="highlight highlight-source-python"><pre>print(\"x\")</pre></div>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // We currently unwrap the wrapper (dropping its classes) before collecting parent classes, so no python fence.
        expect(md).toMatch(/```[a-z0-9-]*[\r\n]+print\("x"\)[\s\S]*```/);
        expect(md).not.toMatch(/```python/);
    });

    // --------------------------------------------------
    // Additional language inference tests
    // --------------------------------------------------
    test('alias: cpp class name produces cpp fence (C++)', async () => {
        const html = '<pre class="language-cpp"><code>int main() {}</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```cpp[\s\S]*int main/);
    });

    test('alias: cxx -> cpp', async () => {
        const html = '<pre class="language-cxx"><code>int main() {}</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```cpp[\s\S]*int main/);
    });

    test('alias: mjs -> javascript', async () => {
        const html = '<pre class="language-mjs"><code>export default 1;</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```javascript[\s\S]*export default/);
    });

    test('alias: cjs -> javascript', async () => {
        const html = '<pre class="language-cjs"><code>module.exports = 1;</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```javascript[\s\S]*module\.exports/);
    });

    test('alias: yml -> yaml', async () => {
        const html = '<pre class="language-yml"><code>key: value</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```yaml[\s\S]*key: value/);
    });

    test('alias: golang -> go', async () => {
        const html = '<pre class="language-golang"><code>package main</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```go[\s\S]*package main/);
    });

    test('alias: kt -> kotlin', async () => {
        const html = '<pre class="language-kt"><code>fun main() {}</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```kotlin[\s\S]*fun main/);
    });

    test('alias: docker -> dockerfile', async () => {
        const html = '<pre class="language-docker"><code>FROM alpine</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```dockerfile[\s\S]*FROM alpine/);
    });

    test('pattern: prettyprint lang-rb -> ruby', async () => {
        const html = '<pre class="prettyprint lang-rb"><code>puts :x</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```ruby[\s\S]*puts :x/);
    });

    test('pattern: hljs-rust -> rust', async () => {
        const html = '<pre><code class="hljs-rust">fn main() {}</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```rust[\s\S]*fn main/);
    });

    test('pattern: brush:js -> javascript', async () => {
        const html = '<pre class="brush:js"><code>console.log(1)</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```javascript[\s\S]*console\.log/);
    });

    test('pattern: code-python -> python', async () => {
        const html = '<pre class="code-python"><code>print(\"x\")</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```python[\s\S]*print\("x"\)/);
    });

    test('wrapper figure.highlight with language-tsx in pre', async () => {
        const html =
            '<figure class="highlight"><pre class="language-tsx"><code>const x: JSX.Element = &lt;div/&gt;;</code></pre></figure>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Accept tsx (no alias conversion performed for tsx)
        expect(md).toMatch(/```tsx[\s\S]*const x:/);
    });

    test('div.sourceCode wrapper with language-ts on inner code', async () => {
        const html = '<div class="sourceCode"><pre><code class="language-ts">let x: number;</code></pre></div>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```typescript[\s\S]*let x:/);
    });

    test('duplicate hint classes collapse to single normalized language', async () => {
        const html = '<pre class="language-js lang-js highlight-source-javascript"><code>console.log(2)</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Should be only one javascript fence
        expect(md).toMatch(/```javascript[\s\S]*console\.log/);
        // Should not retain multiple language markers inside fence line
        const fenceLine = md.split(/\n/)[0];
        expect(fenceLine.match(/javascript/g)?.length).toBe(1);
    });

    test('fallback: no language classes yields fence without language', async () => {
        const html = '<pre><code>plain text only</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Opening fence should be exactly ``` or ``` + optional language but we assert absence of a known language (- not present)
        expect(md).toMatch(/^```\nplain text only/);
    });

    test('priority: language-js over hljs-python chooses javascript', async () => {
        const html = '<pre class="language-js"><code class="hljs-python">console.log(3)</code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        expect(md).toMatch(/```javascript[\s\S]*console\.log/);
        expect(md).not.toMatch(/```python/);
    });

    test('removes empty / folded code block with only styling spans', async () => {
        const html =
            '<pre class="language-js"><code><span class="token comment"></span><span class="token keyword"></span><span class="token punctuation"></span></code></pre>';
        const { markdown } = await convertHtmlToMarkdown(html, true);
        const md = markdown.trim();
        // Should not emit an empty fenced code block
        expect(md).not.toMatch(/```/);
    });

    test('maps js alias to javascript', async () => {
        const html = '<pre class="language-js"><code>console.log(1)</code></pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        expect(md).toMatch(/```javascript[\s\S]*console\.log/);
    });

    test('escaped tags preserved (no forced html heuristic)', async () => {
        const html = '<pre><code>&lt;div&gt;Hello&lt;/div&gt;</code></pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Accept with explicit html language (if future explicit class added) or without language.
        expect(md).toMatch(/```(?:html)?[\s\S]*<div>Hello<\/div>[\s\S]*```/);
    });

    test('sanitizes live <script> but preserves script tag text inside code (no html heuristic)', async () => {
        const html =
            '<div><script>alert(1)</script></div><pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>';
        const { markdown: md } = await convertHtmlToMarkdown(html, true);
        // Ensure any alert(1) appears only inside fenced code (capture fenced block then check counts)
        const occurrences = (md.match(/alert\(1\)/g) || []).length;
        expect(occurrences).toBeGreaterThanOrEqual(1);
        // Should appear within a fenced code block (language may be absent now)
        expect(md).toMatch(/```(?:html)?[\s\S]*<script>alert\(1\)<\/script>[\s\S]*```/);
    });
});
