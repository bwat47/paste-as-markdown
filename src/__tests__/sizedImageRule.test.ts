import { convertHtmlToMarkdown } from '../markdownConverter';

test('retains sized <img> as raw HTML', async () => {
    const html = '<p>Before <img src="x.png" width="100" height="50" alt="Alt"> After';
    const { markdown } = await convertHtmlToMarkdown(html, true, false);
    expect(markdown).toContain('<img src="x.png" alt="Alt" width="100" height="50">');
});

test('unsized <img> converts to markdown image syntax', async () => {
    const html = '<p><img src="y.png" alt="Y"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, true, false);
    // Should become ![Y](y.png)
    expect(markdown).toMatch(/!\[Y\]\(y.png\)/);
});

test('width-only image is preserved as HTML', async () => {
    const html = '<p><img src="w.png" width="120" alt="W"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, true, false);
    expect(markdown).toContain('<img src="w.png" alt="W" width="120">');
});

test('height-only image is preserved as HTML', async () => {
    const html = '<p><img src="h.png" height="90" alt="H"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, true, false);
    expect(markdown).toContain('<img src="h.png" alt="H" height="90">');
});

test('sized <img> preserves title attribute and order', async () => {
    const html = '<p><img src="t.png" width="10" alt="A" title="T"></p>';
    const { markdown } = await convertHtmlToMarkdown(html, true, false);
    expect(markdown).toContain('<img src="t.png" alt="A" title="T" width="10">');
});
