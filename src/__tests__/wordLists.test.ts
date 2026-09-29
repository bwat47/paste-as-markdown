import { describe, expect, test } from 'vitest';
import { normalizeWordLists } from '../html/pre/wordLists';
import { processHtml } from '../html/processHtml';
import { convertHtmlToMarkdown } from './helpers/pasteConversion';
import { pasteOptions } from './helpers/pasteOptions';

function wordItem(content: string, level = 1, marker = '·', instance = 'lfo1', list = 'l0'): string {
    return `<p class="MsoNoSpacing" style="margin-left:.5in;mso-list:\n ${list} level${level} ${instance}">
        <![if !supportLists]><span style="font-family:Symbol"><span style="mso-list:\n Ignore">${marker}<span>&nbsp;&nbsp; </span></span></span><![endif]>
        ${content}<o:p></o:p></p>`;
}

async function markdown(html: string): Promise<string> {
    return (await convertHtmlToMarkdown(html)).markdown.trim();
}

describe('Desktop Word lists', () => {
    test('reconstructs the desktop sample hierarchy while preserving formatting and links', async () => {
        const html =
            '<h1>Bugs and Issues Addressed</h1>' +
            wordItem('Updates to the Gantt Chart.') +
            wordItem('<b>Application Control Conversions</b>') +
            wordItem('Converted Tree controls.', 2, 'o') +
            wordItem('Converted Chart controls.', 2, 'o') +
            wordItem('Converted Schedule controls.', 2, 'o') +
            wordItem('<b>License Manager</b>') +
            wordItem('Improvements to the backend.', 2, 'o') +
            wordItem('<a href="https://example.com">Improved Security.</a>', 2, 'o');
        expect(await markdown(html)).toBe(
            '# Bugs and Issues Addressed\n\n' +
                '- Updates to the Gantt Chart.\n' +
                '- **Application Control Conversions**\n' +
                '\t- Converted Tree controls.\n\t- Converted Chart controls.\n\t- Converted Schedule controls.\n' +
                '- **License Manager**\n\t- Improvements to the backend.\n' +
                '\t- [Improved Security.](https://example.com)'
        );
    });

    test.each(['<div class="WordSection1">', '<table><tr><td>'])('handles a list inside %s', async (opening) => {
        const closing = opening.startsWith('<div') ? '</div>' : '</td></tr></table>';
        const { body } = await processHtml(
            opening + wordItem('Parent') + wordItem('Child', 2, 'o') + closing,
            pasteOptions()
        );
        expect(body.querySelector('ul > li > ul > li')?.textContent?.trim()).toBe('Child');
        expect(body.querySelectorAll('li')).toHaveLength(2);
    });

    test('handles three levels and returning to each parent', async () => {
        expect(
            await markdown(
                wordItem('Parent') +
                    wordItem('Child', 2, 'o') +
                    wordItem('Grandchild', 3, '') +
                    wordItem('Another child', 2, 'o') +
                    wordItem('Another parent')
            )
        ).toBe('- Parent\n\t- Child\n\t\t- Grandchild\n\t- Another child\n- Another parent');
    });

    test('normalizes partial selections and missing levels without empty list items', async () => {
        expect(
            await markdown(
                wordItem('Selected child', 3, 'o') + wordItem('Next parent', 1) + wordItem('Deep child', 4, '')
            )
        ).toBe('- Selected child\n- Next parent\n\t- Deep child');
    });

    test('nests later children under a shallower parent reached from a partial selection', async () => {
        expect(
            await markdown(wordItem('Selected child', 2, 'o') + wordItem('Parent') + wordItem('Child', 2, 'o'))
        ).toBe('- Selected child\n- Parent\n\t- Child');
    });

    test('nests a skipped level and a later intermediate level under the same parent', async () => {
        expect(
            await markdown(
                wordItem('Parent') + wordItem('Skipped', 3, '') + wordItem('Child', 2, 'o') + wordItem('Next parent')
            )
        ).toBe('- Parent\n\t- Skipped\n\t- Child\n- Next parent');
    });

    // `§` and U+F0FC are Wingdings glyphs; an empty marker is a picture bullet.
    test.each(['-', '§', '\u{f0fc}', ''])('treats the non-numbered marker "%s" as a bullet', async (marker) => {
        expect(await markdown(wordItem('First', 1, marker) + wordItem('Second', 1, marker))).toBe('- First\n- Second');
    });

    test('nests a list with a different Word list ID by its level', async () => {
        expect(
            await markdown(
                wordItem('Bullet') +
                    wordItem('Numbered child', 2, '1.', 'lfo2', 'l1') +
                    wordItem('Next numbered child', 2, '2.', 'lfo2', 'l1') +
                    wordItem('Next bullet')
            )
        ).toBe('- Bullet\n\t1. Numbered child\n\t2. Next numbered child\n- Next bullet');
    });

    test('keeps same-level items from different Word lists in separate lists', async () => {
        const { body } = await processHtml(
            wordItem('First list') + wordItem('Second list', 1, '·', 'lfo2', 'l1'),
            pasteOptions({ forceTightLists: false })
        );
        expect(Array.from(body.querySelectorAll('ul')).map((list) => list.textContent?.trim())).toEqual([
            'First list',
            'Second list',
        ]);
    });

    test('nests legal numbering by its last segment', async () => {
        expect(
            await markdown(
                wordItem('One', 1, '1.') +
                    wordItem('One point one', 2, '1.1.') +
                    wordItem('One point two', 2, '1.2') +
                    wordItem('Deep', 3, '1.2.1.') +
                    wordItem('Two', 1, '2.')
            )
        ).toBe('1. One\n\t1. One point one\n\t2. One point two\n\t\t1. Deep\n2. Two');
    });

    test('preserves decimal starts and nested mixed list types', async () => {
        expect(
            await markdown(wordItem('Third', 1, '3.') + wordItem('Bullet child', 2, 'o') + wordItem('Fourth', 1, '4.'))
        ).toBe('3. Third\n\t- Bullet child\n4. Fourth');
    });

    test.each([
        ['a.', 'b.', '1. First\n2. Second'],
        ['ii.', 'iii.', '2. First\n3. Second'],
        ['(4)', '5)', '4. First\n5. Second'],
    ])('normalizes numbered markers %s and %s', async (first, second, expected) => {
        expect(await markdown(wordItem('First', 1, first) + wordItem('Second', 1, second))).toBe(expected);
    });

    test.each([
        ['z.', 'aa.', 'bb.', '26. First\n27. Second\n28. Third'],
        ['Z.', 'AA.', 'BB.', '26. First\n27. Second\n28. Third'],
        ['zz.', 'aaa.', 'bbb.', '52. First\n53. Second\n54. Third'],
        ['ZZ.', 'AAA.', 'BBB.', '52. First\n53. Second\n54. Third'],
        ['bb.', 'cc.', 'dd.', '28. First\n29. Second\n30. Third'],
    ])('preserves repeated-letter numbering from %s through %s and %s', async (first, second, third, expected) => {
        expect(
            await markdown(wordItem('First', 1, first) + wordItem('Second', 1, second) + wordItem('Third', 1, third))
        ).toBe(expected);
    });

    test('preserves distinct list instances and numbering restarts through tight-list cleanup', async () => {
        const { body } = await processHtml(
            wordItem('First', 1, '3.') + wordItem('Restart', 1, '1.') + wordItem('New instance', 1, '1.', 'lfo2'),
            pasteOptions({ forceTightLists: true })
        );
        expect(Array.from(body.querySelectorAll('ol')).map((list) => list.getAttribute('start'))).toEqual([
            '3',
            '1',
            '1',
        ]);
    });

    test('interrupts runs at prose and visible text, but ignores comments and whitespace', async () => {
        const { body } = await processHtml(
            wordItem('One') +
                '<!-- comment -->\n' +
                wordItem('Two') +
                '<p>Prose</p>' +
                wordItem('Three') +
                'Visible text' +
                wordItem('Four'),
            pasteOptions({ forceTightLists: false })
        );
        expect(Array.from(body.querySelectorAll('ul')).map((list) => list.children.length)).toEqual([2, 1, 1]);
        expect(body.textContent).toContain('Visible text');
    });

    test('leaves flattened paragraphs and incomplete metadata unchanged', async () => {
        const body = new DOMParser().parseFromString(
            '<p>· Flattened</p><p>o Ordinary text</p>' +
                '<p style="mso-list:l0 level1 lfo1">· Missing span</p>' +
                wordItem('Invalid level', 10),
            'text/html'
        ).body;
        const original = body.innerHTML;
        normalizeWordLists(body);
        expect(body.innerHTML).toBe(original);
    });

    test('does not change existing semantic lists or code examples', () => {
        const body = new DOMParser().parseFromString(
            '<ul><li>' + wordItem('Existing') + '</li></ul>' + '<pre><code>' + wordItem('Example') + '</code></pre>',
            'text/html'
        ).body;
        const original = body.innerHTML;
        normalizeWordLists(body);
        expect(body.innerHTML).toBe(original);
    });

    test('sanitizes reconstructed list contents and attributes', async () => {
        const { body } = await processHtml(
            wordItem(
                '<a href="javascript:alert(1)" onclick="alert(1)">Link</a>' +
                    '<img src="x" onerror="alert(1)"><script>alert(1)</script>'
            ),
            pasteOptions()
        );
        expect(body.querySelector('ul > li')).not.toBeNull();
        expect(body.querySelector('script, [style], [onclick], [onerror], [href]')).toBeNull();
        expect(body.textContent).toContain('Link');
    });
});
