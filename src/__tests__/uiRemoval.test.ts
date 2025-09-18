import { describe, test, expect } from '@jest/globals';
import { processHtml } from '../html/processHtml';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('removeNonContentUi pre-sanitize cleanup', () => {
    test('removes buttons, role-based UI, and non-checkbox inputs; preserves checkboxes; skips inside code', async () => {
        const input = `
            <p>Task: <input type="checkbox" checked></p>
            <p>Form: <input type="text" value="hello"></p>
            <p>Pick: <select><option>A</option></select></p>
            <p>Write: <textarea>text</textarea></p>
            <div role="button">Click me</div>
            <div role="toolbar"><span>Toolbar</span></div>
            <pre><code><button>UI</button><input type="text" value="x"></code></pre>
        `;

        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: true,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        const html = body!.innerHTML;

        // Checkbox preserved
        expect(/<input[^>]*type="checkbox"/i.test(html)).toBe(true);

        // Non-checkbox input and select are removed; textarea tag removed but its text remains
        expect(/<input[^>]*type="text"/i.test(html)).toBe(false);
        expect(/<select/i.test(html)).toBe(false);
        expect(/<textarea/i.test(html)).toBe(false);
        expect(html.includes('Write: text')).toBe(true);

        // Role-based UI removed
        expect(html.includes('Click me')).toBe(false);
        expect(html.includes('Toolbar')).toBe(false);

        // Inside code/pre should remain as text content (neutralized)
        // We expect the code block to contain the text from the button or input (e.g., "UI")
        expect(/<pre><code>[\s\S]*UI[\s\S]*<\/code><\/pre>/.test(html)).toBe(true);
    });
});

describe('UI cleanup on real-world fragments', () => {
    test('drops GPT chat <button> labels from clipboard_export.html', async () => {
        const input = readFileSync(join(__dirname, 'clipboard_export.html'), 'utf8');
        const { body } = await processHtml(input, {
            includeImages: false,
            convertImagesToResources: false,
            normalizeQuotes: true,
            forceTightLists: false,
        });
        expect(body).not.toBeNull();
        const html = body!.innerHTML;
        expect(html.includes('repomix-output-bwat47-joplin-co')).toBe(false);
    });
});
