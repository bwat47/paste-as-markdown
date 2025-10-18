import { JSDOM } from 'jsdom';
import { normalizeCodeBlocks } from '../html/post/codeBlocks';
import { neutralizeCodeBlocksPreSanitize } from '../html/pre/codeNeutralize';

describe('normalizeCodeBlocks', () => {
    it('unwraps tables that are mistakenly wrapped in pre elements', () => {
        const dom = new JSDOM(
            '<!doctype html><body><pre class="foo"><table><tbody><tr><td>cell</td></tr></tbody></table></pre></body>'
        );
        const { document } = dom.window;

        neutralizeCodeBlocksPreSanitize(document.body);
        normalizeCodeBlocks(document.body);

        expect(document.querySelector('pre')).toBeNull();
        const table = document.querySelector('table');
        expect(table).not.toBeNull();
        expect(table?.querySelectorAll('tr').length).toBe(1);
    });
});
