import { describe, test, expect } from 'vitest';
import { wrapOrphanedTableElements } from '../markdownConverter';

describe('wrapOrphanedTableElements', () => {
    test.each([
        ['<tr>', '<tr><td>A</td><td>B</td></tr>', '<table><tr><td>A</td><td>B</td></tr></table>'],
        ['<td>', '<td>Cell</td>', '<table><td>Cell</td></table>'],
        ['<tfoot>', '<tfoot><tr><td>Sum</td></tr></tfoot>', '<table><tfoot><tr><td>Sum</td></tr></tfoot></table>'],
        ['<colgroup>', '<colgroup><col><col></colgroup>', '<table><colgroup><col><col></colgroup></table>'],
        ['self-closing <col>', '<col/>', '<table><col/></table>'],
        [
            '<caption> alongside rows',
            '<caption>Cap</caption><tr><td>A</td></tr>',
            '<table><caption>Cap</caption><tr><td>A</td></tr></table>',
        ],
        ['leading/trailing whitespace', '\n  <tr><td>WS</td></tr>  \n', '<table><tr><td>WS</td></tr></table>'],
    ])('wraps orphan %s fragment', (_label, html, expected) => {
        expect(wrapOrphanedTableElements(html)).toBe(expected);
    });

    test.each([
        // A caption never arrives without rows in a real fragment; wrapping it alone would produce a
        // cell-less table that the GFM plugin drops, losing the text.
        ['caption-only fragment', '<caption>Cap</caption>'],
        ['<table> already present', '<table><tr><td>X</td></tr></table>'],
        ['non-table HTML', '<p>Not a table</p>'],
    ])('leaves %s untouched', (_label, html) => {
        expect(wrapOrphanedTableElements(html)).toBe(html);
    });
});
