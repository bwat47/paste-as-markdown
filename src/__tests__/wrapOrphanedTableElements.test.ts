import { describe, test, expect } from '@jest/globals';
import { wrapOrphanedTableElements } from '../markdownConverter';

describe('wrapOrphanedTableElements', () => {
    test('wraps orphan <tr> fragment', () => {
        const html = '<tr><td>A</td><td>B</td></tr>';
        expect(wrapOrphanedTableElements(html)).toBe('<table><tr><td>A</td><td>B</td></tr></table>');
    });

    test('wraps orphan <td> fragment', () => {
        const html = '<td>Cell</td>';
        expect(wrapOrphanedTableElements(html)).toBe('<table><td>Cell</td></table>');
    });

    test('does not double wrap when <table> already present', () => {
        const html = '<table><tr><td>X</td></tr></table>';
        expect(wrapOrphanedTableElements(html)).toBe(html);
    });

    test('leaves non-table HTML untouched', () => {
        const html = '<p>Not a table</p>';
        expect(wrapOrphanedTableElements(html)).toBe(html);
    });

    test('ignores leading/trailing whitespace when detecting fragments', () => {
        const html = '\n  <tr><td>WS</td></tr>  \n';
        expect(wrapOrphanedTableElements(html)).toBe('<table><tr><td>WS</td></tr></table>');
    });

    test('still wraps when non-table text precedes fragment (current heuristic)', () => {
        const html = 'Intro text<tr><td>X</td></tr>';
        expect(wrapOrphanedTableElements(html)).toBe('<table>Intro text<tr><td>X</td></tr></table>');
    });
});
