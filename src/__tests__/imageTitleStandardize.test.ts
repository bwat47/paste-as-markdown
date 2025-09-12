import { describe, test, expect } from '@jest/globals';
import { processHtml } from '../html/processHtml';

describe('image title preservation in standardization', () => {
    test('processHtml preserves title and ordering in standardized img', async () => {
        const input = '<p><img src="u.png" alt="Alt" title="Title" width="5"></p>';
        const { html } = await processHtml(input, {
            includeImages: true,
            convertImagesToResources: false,
            normalizeQuotes: true,
        });
        // Expect attributes ordered as src, alt, title, width, height
        expect(html).toContain('<img src="u.png" alt="Alt" title="Title" width="5">');
    });
});

