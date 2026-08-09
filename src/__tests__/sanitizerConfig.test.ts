import { describe, test, expect } from 'vitest';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from '../sanitizerConfig';

function sanitize(html: string): string {
    const purifier = createDOMPurify(window as unknown as typeof window);
    return purifier.sanitize(html, buildSanitizerConfig({ includeImages: true })) as string;
}

describe('buildSanitizerConfig URI handling', () => {
    test('preserves data URI images', () => {
        expect(sanitize('<img src="data:image/png;base64,AAAA" alt="pasted">')).toBe(
            '<img src="data:image/png;base64,AAAA" alt="pasted">'
        );
    });

    test('removes data URIs from links', () => {
        const html = '<a href="data:text/html,%3Cscript%3Ealert(1)%3C/script%3E">unsafe</a>';

        expect(sanitize(html)).toBe('<a>unsafe</a>');
    });

    test('removes scriptable URI schemes', () => {
        expect(sanitize('<a href="javascript:alert(1)">unsafe</a>')).toBe('<a>unsafe</a>');
    });

    test('preserves Joplin resource paths', () => {
        expect(sanitize('<img src=":/resource-id" alt="resource">')).toBe('<img src=":/resource-id" alt="resource">');
    });
});
