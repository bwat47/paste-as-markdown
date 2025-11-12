import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

/**
 * Invalid list wrapper conversion.
 * Some editors (e.g., OneNote) wrap ordered lists inside unordered list tags,
 * producing invalid HTML like: <ul><p>...</p><ol>...</ol></ul>
 *
 * This is invalid HTML (lists can only contain <li> elements as direct children),
 * but we should handle it gracefully by unwrapping the invalid wrapper.
 */

describe('invalid list wrapper unwrapping', () => {
    test('OneNote-style OL wrapped in UL', async () => {
        const html = `<html>
   <body>
      <ul>
         <p><span>Step 3). Installing the Application Client on any Client machines</span></p>
         <p>Once your Server machine is setup, you'd use the following steps to install the Application on any Client machines:</p>
         <ol type="1">
            <li value="1"><span>Make sure that you have .NET 3.5 installed (this must be installed before you run the application installer):</span></li>
            <ul type="circle">
               <li><span>Go to your Start Menu and search for "Turn Windows Features on or off" in the search box.</span></li>
               <li><span>From the "Turn Windows Features on or off" window, check the box for .NET Framework 3.5 (if it wasn't already checked).</span></li>
               <li><span>Click OK, and select "Let Windows Update download the files for you" when prompted.</span></li>
               <li><span>Wait for it to finish installing, and then proceed with the application installation steps below.</span></li>
            </ul>
            <li><span>Download the Application Install file:<span> </span></span><a href="link-example-test"><span>Application Installer Download</span></a></li>
         </ol>
      </ul>
   </body>
</html>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Should NOT have "- 1." (both UL and OL markers)
        expect(md).not.toMatch(/^-\s+1\./m);

        // Should start with ordered list marker
        expect(md).toMatch(/^1\.\s+Make sure that you have \.NET 3\.5 installed/m);

        // Should have second ordered list item
        expect(md).toMatch(/^2\.\s+Download the Application Install file/m);

        // Should have nested unordered list items (indented)
        expect(md).toContain('- Go to your Start Menu');
        expect(md).toContain('- From the "Turn Windows Features on or off" window');
    });

    test('simple UL wrapping OL', async () => {
        const html = `<ul>
            <ol>
                <li>First item</li>
                <li>Second item</li>
            </ol>
        </ul>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Should be unwrapped to ordered list
        expect(md).toMatch(/^1\.\s+First item/m);
        expect(md).toMatch(/^2\.\s+Second item/m);

        // Should NOT have "- 1."
        expect(md).not.toMatch(/^-\s+1\./m);
    });

    test('UL wrapping paragraphs and OL', async () => {
        const html = `<ul>
            <p>Introduction text</p>
            <p>More text</p>
            <ol>
                <li>Step one</li>
                <li>Step two</li>
            </ol>
        </ul>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Paragraphs should be preserved
        expect(md).toContain('Introduction text');
        expect(md).toContain('More text');

        // OL should be unwrapped and start properly
        expect(md).toMatch(/^1\.\s+Step one/m);
        expect(md).toMatch(/^2\.\s+Step two/m);
    });

    test('nested valid lists are not affected', async () => {
        const html = `<ul>
            <li>First item
                <ol>
                    <li>Sub item 1</li>
                    <li>Sub item 2</li>
                </ol>
            </li>
            <li>Second item</li>
        </ul>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Should preserve proper nesting
        expect(md).toMatch(/^-\s+First item/m);
        expect(md).toContain('1. Sub item 1');
        expect(md).toContain('2. Sub item 2');
        expect(md).toMatch(/^-\s+Second item/m);
    });

    test('OL wrapping UL (reverse case)', async () => {
        const html = `<ol>
            <ul>
                <li>Bullet one</li>
                <li>Bullet two</li>
            </ul>
        </ol>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Should unwrap to unordered list
        expect(md).toMatch(/^-\s+Bullet one/m);
        expect(md).toMatch(/^-\s+Bullet two/m);

        // Should NOT have numbered markers
        expect(md).not.toMatch(/^1\.\s+-/m);
    });

    test('multiple invalid wrappers in document', async () => {
        const html = `<div>
            <ul>
                <ol>
                    <li>First list item</li>
                </ol>
            </ul>
            <p>Some text</p>
            <ol>
                <ul>
                    <li>Second list item</li>
                </ul>
            </ol>
        </div>`;
        const { markdown } = await convertHtmlToMarkdown(html, { includeImages: true });
        const md = markdown.trim();

        // Both lists should be unwrapped correctly
        expect(md).toMatch(/^1\.\s+First list item/m);
        expect(md).toMatch(/^-\s+Second list item/m);
        expect(md).toContain('Some text');
    });
});
