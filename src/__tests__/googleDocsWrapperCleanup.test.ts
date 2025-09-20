import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

describe('Google Docs wrapper cleanup', () => {
    test('unwraps top-level <b id=docs-internal-guid-...> even with extra siblings (meta, Apple BR)', async () => {
        const html = `<!DOCTYPE html>
<html>
<body>
<!--StartFragment--><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-110ec112-7fff-3223-8111-73dd6e68ce71"><p dir="ltr" style="line-height:1.38;margin-top:12pt;margin-bottom:12pt;"><span style="font-size:11pt;font-family:Roboto,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">The final concept I came up with was logically a 12x12 crossbar: eight inputs, eight outputs, and four bidirectional ports.</span></p><p dir="ltr" style="line-height:1.38;margin-top:12pt;margin-bottom:12pt;"><span style="font-size:11pt;font-family:Roboto,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">The input ports were all 50Ω impedance, with a 6 dB (2:1) attenuator and ESD diode prior to the input termination.</span></p></b><br class="Apple-interchange-newline"><!--EndFragment-->
</body>
</html>`;

        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            isGoogleDocs: true,
        });
        const md = markdown.trim();
        // Should not emit stray global bold markers
        expect(md).not.toMatch(/\*\*/);
        expect(md).toMatch(/The final concept/);
        expect(md).toMatch(/The input ports were all 50Ω impedance/);
    });

    test('unwraps nested wrappers when Google Docs is detected', async () => {
        const html = '<b><span id="docs-internal-guid-abc">Hello</span></b>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            isGoogleDocs: true,
        });
        expect(markdown.trim()).toBe('Hello');
    });

    test('does not unwrap when not Google Docs (preserves bold)', async () => {
        const html = '<b><span id="docs-internal-guid-abc">Hello</span></b>';
        const { markdown } = await convertHtmlToMarkdown(html, {
            includeImages: true,
            isGoogleDocs: false,
        });
        expect(markdown.trim()).toBe('**Hello**');
    });
});
