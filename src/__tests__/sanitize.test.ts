import { describe, test, expect } from 'vitest';
import { sanitizeHtml } from '../html/sanitize';

function sanitize(html: string): string {
    return sanitizeHtml(html, true);
}

describe('HTML sanitizer', () => {
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

    test.each([
        ['text input', '<input type="text">'],
        ['input with no type', '<input>'],
        ['radio input', '<input type="radio" checked>'],
        ['hidden input carrying a value', '<input type="hidden" value="secret">'],
    ])('removes %s', (_, html) => {
        expect(sanitize(`<p>Before${html}After</p>`)).toBe('<p>BeforeAfter</p>');
    });

    test('preserves checkbox inputs and their task-list attributes', () => {
        expect(sanitize('<input type="checkbox" checked disabled>')).toBe(
            '<input type="checkbox" checked="" disabled="">'
        );
    });

    test('accepts checkbox type case-insensitively', () => {
        expect(sanitize('<input type="CHECKBOX">')).toBe('<input type="CHECKBOX">');
    });
});
