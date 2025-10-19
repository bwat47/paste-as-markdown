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

    it('converts CodeMirror editors into normalized pre/code blocks', () => {
        const dom = new JSDOM(
            [
                '<!doctype html><body>',
                '<div class="editor">',
                '  <div class="cm-editor">',
                '    <div class="cm-announced" aria-live="polite"></div>',
                '    <div class="cm-scroller">',
                '      <div class="cm-gutters cm-gutters-before" aria-hidden="true">',
                '        <div class="cm-gutter cm-lineNumbers">',
                '          <div class="cm-gutterElement">1</div>',
                '          <div class="cm-gutterElement">2</div>',
                '        </div>',
                '      </div>',
                '      <div spellcheck="false" class="cm-content cm-lineWrapping" data-language="javascript">',
                '        <div class="cm-line"><span>const</span> object = { <span>a</span>: 1, <span>b</span>: 2 };</div>',
                '        <div class="cm-line"><br></div>',
                '        <div class="cm-line"><span>for</span> (const property in object) {</div>',
                '        <div class="cm-line">  console.log(`<span>${property}</span>: <span>${object[property]}</span>`);</div>',
                '        <div class="cm-line">}</div>',
                '      </div>',
                '    </div>',
                '  </div>',
                '</div>',
                '</body>',
            ].join('')
        );
        const { document } = dom.window;

        normalizeCodeBlocks(document.body);

        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const code = pre?.querySelector('code');
        expect(code).not.toBeNull();
        expect(code?.textContent).toContain('const object = { a: 1, b: 2 };');
        expect(code?.textContent).toContain('for (const property in object) {');
        expect(code?.textContent).toContain('console.log(`${property}: ${object[property]}`);');
        expect(document.querySelector('.cm-editor')).toBeNull();
    });
});
