import { expect, test } from 'vitest';
import { convertHtmlToMarkdown } from './helpers/pasteConversion';

test('separates a figure image from its caption', async () => {
    const html = '<figure><img src="https://example.com/big.webp" alt="Hero"><figcaption>Cap</figcaption></figure>';

    // Resource conversion stays off so the caption assertion sees the original `src`.
    const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true, convertImagesToResources: false });

    expect(markdown).toBe('![Hero](https://example.com/big.webp)\n\nCap');
});
