import { test, expect } from 'vitest';
import { convertHtmlToMarkdown } from './helpers/pasteConversion';
import type { PasteOptions } from '../types';

/** Resource conversion stays off so the assertions below see the original `src` values. */
const IMAGE_OPTIONS: Partial<PasteOptions> = { includeImages: true, convertImagesToResources: false };

test.each([
    {
        name: 'retains sized <img> as raw HTML',
        html: '<p>Before <img src="https://example.com/x.png" width="100" height="50" alt="Alt"> After',
        expected: '<img src="https://example.com/x.png" alt="Alt" width="100" height="50">',
    },
    {
        name: 'unsized <img> converts to markdown image syntax',
        html: '<p><img src="https://example.com/y.png" alt="Y"></p>',
        expected: '![Y](https://example.com/y.png)',
    },
    {
        name: 'width-only image is preserved as HTML',
        html: '<p><img src="https://example.com/w.png" width="120" alt="W"></p>',
        expected: '<img src="https://example.com/w.png" alt="W" width="120">',
    },
    {
        name: 'height-only image is preserved as HTML',
        html: '<p><img src="https://example.com/h.png" height="90" alt="H"></p>',
        expected: '<img src="https://example.com/h.png" alt="H" height="90">',
    },
])('$name', async ({ html, expected }) => {
    const { markdown } = await convertHtmlToMarkdown(html, IMAGE_OPTIONS);
    expect(markdown).toContain(expected);
});

test('sized <img> preserves title attribute and order', async () => {
    const html = '<p><img src="https://example.com/t.png" width="10" alt="A" title="T"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, IMAGE_OPTIONS);
    expect(markdown).toContain('<img src="https://example.com/t.png" alt="A" title="T" width="10">');
});

test('sized <img> escapes attributes when preserving raw HTML', async () => {
    const html = '<p><img src="https://example.com/x.png" width="10" alt="&quot; onerror=&quot;alert(1)"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, IMAGE_OPTIONS);

    expect(markdown).toContain('alt="&quot; onerror=&quot;alert(1)"');

    const parsed = new DOMParser().parseFromString(markdown, 'text/html');
    const img = parsed.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('" onerror="alert(1)');
    expect(img?.hasAttribute('onerror')).toBe(false);
});

test('sized <img> collapses attribute newlines before preserving raw HTML', async () => {
    const html =
        '<p><img src="https://example.com/x.png&#10;&#10;https://example.com/next.png" width="10" alt="a" title="x&#10;&#10;[evil](http://evil.example)"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, IMAGE_OPTIONS);

    expect(markdown).toContain(
        '<img src="https://example.com/x.png https://example.com/next.png" alt="a" title="x [evil](http://evil.example)" width="10">'
    );
    expect(markdown).not.toContain('\n\n[evil](http://evil.example)');
});
