import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

// Security-focused tests to guard against XSS via clipboard HTML

describe('security: script injection prevention', () => {
    test('blocks malicious onload handlers in images but preserves image', async () => {
        const maliciousHtml = `
            <p>Evil image:</p>
            <img onload="document.body.innerHTML += 'HACKED'"
                 src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9yZWN0Pjwvc3ZnPg==" />
        `;

        const { markdown } = await convertHtmlToMarkdown(maliciousHtml, true);

        // Should NOT contain any onload attribute
        expect(markdown).not.toMatch(/onload/i);
        // Should still contain the image (but sanitized)
        expect(markdown).toMatch(/!\[.*\]\(data:image\/svg/i);
    });

    test('removes script tags entirely but preserves surrounding content', async () => {
        const htmlWithScript = `
            <p>Before script</p>
            <script>alert('evil');<\/script>
            <p>After script</p>
        `;

        const { markdown } = await convertHtmlToMarkdown(htmlWithScript, true);

        expect(markdown).not.toMatch(/<script/i);
        expect(markdown).not.toMatch(/alert\(/);
        expect(markdown).toMatch(/Before script/);
        expect(markdown).toMatch(/After script/);
    });

    test('blocks iframe and object tags and dangerous URI schemes', async () => {
        const htmlWithEmbeds = `
            <p>Content</p>
            <iframe src="javascript:alert('xss')"></iframe>
            <object data="malicious.swf"></object>
            <a href="javascript:alert('xss')">bad link</a>
        `;

        const { markdown } = await convertHtmlToMarkdown(htmlWithEmbeds, true);

        expect(markdown).not.toMatch(/<iframe/i);
        expect(markdown).not.toMatch(/<object/i);
        expect(markdown).not.toMatch(/javascript:/i);
        expect(markdown).toMatch(/Content/);
    });
});
