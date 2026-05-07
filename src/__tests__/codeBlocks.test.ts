import { normalizeCodeBlocks } from '../html/post/codeBlocks';
import { neutralizeCodeBlocksPreSanitize } from '../html/pre/codeNeutralize';

function parseBody(html: string): HTMLElement {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return document.body;
}

describe('normalizeCodeBlocks', () => {
    it('unwraps tables that are mistakenly wrapped in pre elements', () => {
        const body = parseBody(
            '<!doctype html><body><pre class="foo"><table><tbody><tr><td>cell</td></tr></tbody></table></pre></body>'
        );

        neutralizeCodeBlocksPreSanitize(body);
        normalizeCodeBlocks(body);

        expect(body.querySelector('pre')).toBeNull();
        const table = body.querySelector('table');
        expect(table).not.toBeNull();
        expect(table?.querySelectorAll('tr').length).toBe(1);
    });

    it('converts CodeMirror editors into normalized pre/code blocks', () => {
        const body = parseBody(
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

        normalizeCodeBlocks(body);

        const pre = body.querySelector('pre');
        expect(pre).not.toBeNull();
        const code = pre?.querySelector('code');
        expect(code).not.toBeNull();
        expect(code?.textContent).toContain('const object = { a: 1, b: 2 };');
        expect(code?.textContent).toContain('for (const property in object) {');
        expect(code?.textContent).toContain('console.log(`${property}: ${object[property]}`);');
        expect(body.querySelector('.cm-editor')).toBeNull();
    });

    it('removes adjacent language labels before code blocks and applies the language class', () => {
        const body = parseBody(
            [
                '<!doctype html><body>',
                '<div dir="auto">',
                '  <div data-testid="code-block">',
                '    <div><span>TypeScript</span></div>',
                '    <div><div><div></div></div></div>',
                '    <div><pre tabindex="0"><code>const value = 42;</code></pre></div>',
                '  </div>',
                '</div>',
                '</body>',
            ].join('')
        );

        normalizeCodeBlocks(body);

        const code = body.querySelector('pre code') as HTMLElement | null;
        expect(code).not.toBeNull();
        expect(code?.classList.contains('language-typescript')).toBe(true);
        expect(body.innerHTML).not.toContain('TypeScript');
    });

    it('removes sibling copy toolbars that precede the code block', () => {
        const body = parseBody(
            [
                '<!doctype html><body>',
                '<div class="evo-codeheader">',
                '  <div class="code-header d-flex align-items-center justify-content-end gap-4">',
                '    <span class="language"></span>',
                '    <button class="copy-button d-flex align-items-center">Copy</button>',
                '  </div>',
                '</div>',
                '<pre class="prettyprint language-typescript" tabindex="0">',
                '  <code>console.log("hello");</code>',
                '</pre>',
                '</body>',
            ].join('')
        );

        normalizeCodeBlocks(body);

        expect(body.querySelector('button.copy-button')).toBeNull();
        const pre = body.querySelector('pre');
        expect(pre).not.toBeNull();
        const code = pre?.querySelector('code');
        expect(code?.textContent).toContain('console.log("hello");');
    });
});
