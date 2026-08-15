import { describe, expect, test } from 'vitest';
import { processHtml } from '../html/processHtml';
import { normalizeAnchors } from '../html/post/anchors';
import { pasteOptions } from './helpers/pasteOptions';

function normalizeAnchorHtml(html: string): HTMLAnchorElement {
    const document = new DOMParser().parseFromString(html, 'text/html');
    normalizeAnchors(document.body);

    const anchor = document.body.querySelector<HTMLAnchorElement>('a');
    expect(anchor).not.toBeNull();
    return anchor!;
}

describe('empty anchor cleanup', () => {
    const options = pasteOptions({ normalizeQuotes: false });

    test('removes anchors that only contain decorative svg content', async () => {
        const input = `
            <p>
                <a href="https://example.com" aria-label="Icon only">
                    <svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>
                </a>
            </p>
        `;
        const { body } = await processHtml(input, options);
        expect(body).not.toBeNull();
        expect(body!.querySelector('a[href="https://example.com"]')).toBeNull();
    });

    test('preserves image anchors when images are included', async () => {
        const input = '<p><a href="https://example.com"><img src="test.png" alt="Example"></a></p>';
        const { body } = await processHtml(input, options);
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
        const { body } = await processHtml(input, options);
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
        const { body } = await processHtml(input, options);
        expect(body).not.toBeNull();
        const heading = body!.querySelector('h2#quota');
        expect(heading).not.toBeNull();
        expect(heading!.textContent).toContain('Quota Limits');
        expect(body!.querySelector('a.headerlink')).toBeNull();
    });
});

describe('anchor line-breaking element normalization', () => {
    test('does not duplicate whitespace from a whitespace-only block', () => {
        const anchor = normalizeAnchorHtml(
            '<a href="https://example.com"><span>Before</span><div> </div><span>After</span></a>'
        );

        expect(anchor.innerHTML).toBe('<span>Before</span> <span>After</span>');
        expect(anchor.textContent).toBe('Before After');
    });

    test('adds boundaries around a block whose children have no text', () => {
        const anchor = normalizeAnchorHtml(
            '<a href="https://example.com"><span>Before</span><div><img src="test.png" alt="Example"></div><span>After</span></a>'
        );

        expect(anchor.innerHTML).toBe('<span>Before</span> <img src="test.png" alt="Example"> <span>After</span>');
    });

    test('does not add trailing whitespace when a block is the last child', () => {
        const anchor = normalizeAnchorHtml('<a href="https://example.com"><span>Before</span><div>After</div></a>');

        expect(anchor.innerHTML).toBe('<span>Before</span> After');
        expect(anchor.textContent).toBe('Before After');
    });
});
