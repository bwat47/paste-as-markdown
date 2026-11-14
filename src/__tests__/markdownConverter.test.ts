import { describe, expect, test } from 'vitest';

import { domToMarkdown } from '../markdown/markdownConverter';
import { LIST_INDENTATION } from '../types';

const OPTIONS = { listIndentation: LIST_INDENTATION.SPACES };

describe('domToMarkdown with trusted, processed DOMs', () => {
    test('converts custom rules without preprocessing and leaves the input unchanged', () => {
        const body = document.createElement('body');
        const paragraph = document.createElement('p');
        const mark = document.createElement('mark');
        mark.textContent = 'Highlighted';
        const image = document.createElement('img');
        image.src = 'example.png';
        image.alt = 'Example';
        image.width = 100;
        paragraph.append(mark, document.createTextNode(' '), image);
        body.append(paragraph);
        const original = body.cloneNode(true);

        expect(domToMarkdown(body, OPTIONS)).toBe('==Highlighted== <img src="example.png" alt="Example" width="100">');
        expect(body.isEqualNode(original)).toBe(true);
        expect(body.firstChild).toBe(paragraph);
        expect(paragraph.firstChild).toBe(mark);
    });

    test('honors tab indentation on a prepared list', () => {
        const body = document.createElement('body');
        const list = document.createElement('ul');
        const item = document.createElement('li');
        const nestedList = document.createElement('ul');
        const nestedItem = document.createElement('li');
        item.textContent = 'Parent';
        nestedItem.textContent = 'Child';
        nestedList.append(nestedItem);
        item.append(nestedList);
        list.append(item);
        body.append(list);

        expect(domToMarkdown(body, { ...OPTIONS, listIndentation: LIST_INDENTATION.TABS })).toBe('- Parent\n\t- Child');
    });

    test('cleans block spacing while preserving whitespace inside fenced code', () => {
        const body = document.createElement('body');
        const heading = document.createElement('h1');
        heading.textContent = 'Example';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = 'first\n   \n\n\nlast\n';
        pre.append(code);
        body.append(heading, pre);

        expect(domToMarkdown(body, OPTIONS)).toBe('# Example\n\n```\nfirst\n   \n\n\nlast\n```');
    });

    test.each([
        ['a numeric start', ' start="3"', '3. A\n4. B'],
        ['an empty start', ' start=""', '1. A\n2. B'],
        ['a non-numeric start', ' start="abc"', '1. A\n2. B'],
        ['no start', '', '1. A\n2. B'],
    ])('numbers ordered items from %s', (_label, startAttribute, expected) => {
        const body = document.createElement('body');
        body.innerHTML = `<ol${startAttribute}><li>A</li><li>B</li></ol>`;

        expect(domToMarkdown(body, OPTIONS)).toBe(expected);
    });

    test('normalizes task checkbox spacing and keeps an empty task marker', () => {
        const body = document.createElement('body');
        body.innerHTML = '<ul><li><input type="checkbox" checked>   Done</li><li><input type="checkbox"></li></ul>';

        expect(domToMarkdown(body, OPTIONS)).toBe('- [x] Done\n- [ ]');
    });
});
