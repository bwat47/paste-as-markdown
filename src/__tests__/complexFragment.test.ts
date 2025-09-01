import { describe, test, expect } from '@jest/globals';
import { convertHtmlToMarkdown } from '../markdownConverter';

// Snapshot test: combined real-world fragment (email artifacts + table + image + code span)
// Guards against regressions across multiple transformation features simultaneously.
describe('complex fragment snapshot', () => {
    test('email/table/image fragment (images on/off)', () => {
        const html = `<!--StartFragment-->
<div class=MsoNormal><b>Report Summary</b></div>
<table style="border-collapse:collapse" width="100%"><tr><th>Item</th><th>Count</th></tr><tr><td>Apples<br>Green</td><td>12</td></tr><tr><td>Oranges</td><td>7</td></tr></table>
<p><a href="https://example.com"><img src="https://example.com/chart.png" alt="Chart" width="400" height="200"></a></p>
<p class=MsoNormal><span style='font-size:11pt'><o:p>&nbsp;</o:p></span></p>
<p>Footer note with <code>&lt;br&gt;</code> example.</p>
<!--EndFragment-->`;

        const withImages = convertHtmlToMarkdown(html, true).trim();
        const withoutImages = convertHtmlToMarkdown(html, false).trim();

        expect({ withImages, withoutImages }).toMatchSnapshot();
    });
});
