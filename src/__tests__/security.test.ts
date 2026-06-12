import { describe, test, expect } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import type { PasteOptions } from '../types';

// Security-focused tests to guard against XSS via clipboard HTML

const TEST_OPTIONS: PasteOptions = {
    includeImages: true,
    convertImagesToResources: false,
    normalizeQuotes: true,
    forceTightLists: false,
};

const DANGEROUS_ELEMENTS = 'script, iframe, object, embed, applet, frame, frameset, base, meta, link, svg, math';
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'data', 'action', 'formaction']);

function reparseBody(body: HTMLElement): HTMLElement {
    const reparsed = new DOMParser().parseFromString(body.innerHTML, 'text/html');
    return reparsed.body;
}

function collectExecutableAttributes(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes)
            .filter((attr) => attr.name.toLowerCase().startsWith('on'))
            .map((attr) => `${element.tagName.toLowerCase()}[${attr.name}]`)
    );
}

function collectUnsafeUrls(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes)
            .filter((attr) => URL_ATTRIBUTES.has(attr.name.toLowerCase()))
            .filter((attr) => {
                const value = attr.value.trim();
                return (
                    /^(?:javascript|vbscript):/i.test(value) ||
                    (attr.name.toLowerCase() === 'href' && /^data:/i.test(value))
                );
            })
            .map((attr) => `${element.tagName.toLowerCase()}[${attr.name}="${attr.value}"]`)
    );
}

function expectNoActiveContent(root: ParentNode): void {
    expect(root.querySelector(DANGEROUS_ELEMENTS)).toBeNull();
    expect(collectExecutableAttributes(root)).toEqual([]);
    expect(collectUnsafeUrls(root)).toEqual([]);
}

describe('security: script injection prevention', () => {
    test('blocks malicious onload handlers in images but preserves image', async () => {
        const maliciousHtml = `
            <p>Evil image:</p>
            <img onload="document.body.innerHTML += 'HACKED'"
                 src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9yZWN0Pjwvc3ZnPg==" />
        `;

        const { body } = await processHtml(maliciousHtml, TEST_OPTIONS);
        const reparsed = reparseBody(body);
        const img = reparsed.querySelector('img');

        expectNoActiveContent(reparsed);
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).toMatch(/^data:image\/svg/i);
        expect(img?.hasAttribute('onload')).toBe(false);
    });

    test('removes script tags entirely but preserves surrounding content', async () => {
        const htmlWithScript = `
            <p>Before script</p>
            <script>alert('evil');<\/script>
            <p>After script</p>
        `;

        const { body } = await processHtml(htmlWithScript, TEST_OPTIONS);
        const reparsed = reparseBody(body);

        expectNoActiveContent(reparsed);
        expect(reparsed.textContent).not.toMatch(/alert\(/);
        expect(reparsed.textContent).toMatch(/Before script/);
        expect(reparsed.textContent).toMatch(/After script/);
    });

    test('blocks dangerous elements, namespaces, and URI schemes after reparsing', async () => {
        const htmlWithEmbeds = `
            <p>Content</p>
            <iframe src="javascript:alert('xss')"></iframe>
            <object data="malicious.swf"></object>
            <a href="javascript:alert('xss')">bad link</a>
            <a href="data:text/html,<script>alert('xss')</script>">data link</a>
            <svg><g onload="alert('xss')"></g></svg>
            <math><mi xlink:href="javascript:alert('xss')">x</mi></math>
        `;

        const { body } = await processHtml(htmlWithEmbeds, TEST_OPTIONS);
        const reparsed = reparseBody(body);
        const links = Array.from(reparsed.querySelectorAll('a'));

        expectNoActiveContent(reparsed);
        expect(reparsed.textContent).toMatch(/Content/);
        expect(links).toHaveLength(2);
        expect(links.every((link) => !link.hasAttribute('href'))).toBe(true);
    });
});
