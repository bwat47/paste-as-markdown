import { describe, expect, test } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import type { PasteOptions } from '../types';

describe('empty anchor cleanup', () => {
    const defaultOptions: PasteOptions = {
        includeImages: true,
        convertImagesToResources: false,
        normalizeQuotes: false,
        forceTightLists: false,
    };

    test('removes anchors that only contain decorative svg content', async () => {
        const input = `
            <p>
                <a href="https://example.com" aria-label="Icon only">
                    <svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>
                </a>
            </p>
        `;
        const { body } = await processHtml(input, defaultOptions);
        expect(body).not.toBeNull();
        expect(body!.querySelector('a[href="https://example.com"]')).toBeNull();
    });

    test('preserves image anchors when images are included', async () => {
        const input = '<p><a href="https://example.com"><img src="test.png" alt="Example"></a></p>';
        const { body } = await processHtml(input, defaultOptions);
        expect(body).not.toBeNull();
        const anchor = body!.querySelector('a[href="https://example.com"]');
        expect(anchor).not.toBeNull();
        expect(anchor!.querySelector('img')).not.toBeNull();
    });

    test('removes heading permalink anchors with visible glyphs', async () => {
        const input = `
            <h2 id="rate-limits">Rate Limits
                <a class="headerlink" href="#rate-limits" title="Permalink to this heading">¶</a>
            </h2>
        `;
        const { body } = await processHtml(input, defaultOptions);
        expect(body).not.toBeNull();
        const heading = body!.querySelector('h2#rate-limits');
        expect(heading).not.toBeNull();
        expect(heading!.textContent).toContain('Rate Limits');
        expect(body!.querySelector('a.headerlink')).toBeNull();
    });

    test('removes heading permalink anchors when href contains absolute URL fragment', async () => {
        const input = `
            <h2 id="quota">Quota Limits
                <a class="headerlink" href="https://example.com/docs#quota" title="Permalink to this heading">¶</a>
            </h2>
        `;
        const { body } = await processHtml(input, defaultOptions);
        expect(body).not.toBeNull();
        const heading = body!.querySelector('h2#quota');
        expect(heading).not.toBeNull();
        expect(heading!.textContent).toContain('Quota Limits');
        expect(body!.querySelector('a.headerlink')).toBeNull();
    });
});
