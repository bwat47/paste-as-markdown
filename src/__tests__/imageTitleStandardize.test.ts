import { describe, test, expect } from '@jest/globals';
import { processHtml } from '../html/processHtml';

describe('image title preservation in standardization', () => {
    test('processHtml preserves title and ordering in standardized img', async () => {
        const input = '<p><img src="u.png" alt="Alt" title="Title" width="5"></p>';
        const { body } = await processHtml(input, {
            includeImages: true,
            convertImagesToResources: false,
            normalizeQuotes: true,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        const html = body!.innerHTML;
        // Expect attributes ordered as src, alt, title, width, height
        expect(html).toContain('<img src="u.png" alt="Alt" title="Title" width="5">');
    });
});
