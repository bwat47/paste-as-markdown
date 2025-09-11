import { onlyContains } from '../shared/dom';

export function markNbspOnlyInlineCode(body: HTMLElement): void {
    const codes = Array.from(body.querySelectorAll('code')) as HTMLElement[];
    codes.forEach((code) => {
        if (code.parentElement && code.parentElement.tagName === 'PRE') return;
        const text = code.textContent || '';
        if (!text) return;
        const hasNbsp = /\u00A0/.test(text);
        if (hasNbsp && text.replace(/\u00A0|\s/g, '') === '') {
            code.textContent = '__PAM_NBSP__';
        }
    });
}

export function normalizeCodeBlocks(body: HTMLElement): void {
    const pres = findAndUnwrapCodeBlocks(body);
    pres.forEach((pre) => {
        ensureCodeElement(pre);
        removeUIElements(pre);
        const code = pre.querySelector('code')!;
        if (isEmptyCodeBlock(code)) {
            pre.remove();
            return;
        }
        normalizeLanguageClass(pre, code);
    });
}

function findAndUnwrapCodeBlocks(body: HTMLElement): HTMLElement[] {
    const wrappers = Array.from(
        body.querySelectorAll('div.highlight, div.snippet-clipboard-content, div.sourceCode, figure.highlight, pre')
    );
    const pres: HTMLElement[] = [];
    wrappers.forEach((wrapper) => {
        const wrapperEl = wrapper as HTMLElement;
        const pre =
            wrapperEl.tagName.toLowerCase() === 'pre' ? wrapperEl : (wrapperEl.querySelector('pre') as HTMLElement);
        if (!pre) return;
        if (pre !== wrapperEl && wrapperEl.parentElement && onlyContains(wrapperEl, pre)) {
            wrapperEl.parentElement.replaceChild(pre, wrapperEl);
        }
        pres.push(pre);
    });
    return pres;
}

function ensureCodeElement(pre: HTMLElement): void {
    let code = pre.querySelector('code');
    if (!code) {
        code = pre.ownerDocument.createElement('code');
        while (pre.firstChild) code.appendChild(pre.firstChild);
        pre.appendChild(code);
    }
}

function removeUIElements(pre: HTMLElement): void {
    let code: HTMLElement | null = null;
    for (const child of Array.from(pre.children)) {
        if (child.tagName.toLowerCase() === 'code') {
            code = child as HTMLElement;
            break;
        }
    }
    if (!code) {
        const descendant = pre.querySelector('code') as HTMLElement | null;
        if (descendant) {
            while (pre.firstChild) pre.removeChild(pre.firstChild);
            pre.appendChild(descendant);
            code = descendant;
        }
    }
    if (!code) return;
    for (const child of Array.from(pre.children)) {
        if (child !== code && shouldRemoveUIElement(child)) child.remove();
    }
}

function shouldRemoveUIElement(element: Element): boolean {
    return (
        /codeblock-button-wrapper|copy|fullscreen|toolbar/i.test(element.className) ||
        element.tagName === 'DIV' ||
        element.tagName === 'BUTTON'
    );
}

function isEmptyCodeBlock(code: HTMLElement): boolean {
    return !code.textContent || code.textContent.replace(/\s+/g, '') === '';
}

function normalizeLanguageClass(pre: HTMLElement, code: HTMLElement): void {
    const language = inferLanguageFromClasses(pre, code);
    if (!language) return;
    code.className = code.className
        .split(/\s+/)
        .filter((c) => c && !/^lang(uage)?-/i.test(c) && !/^highlight-source-/i.test(c))
        .join(' ');
    if (!code.classList.contains(`language-${language}`)) {
        code.classList.add(`language-${language}`);
    }
}

function inferLanguageFromClasses(pre: HTMLElement, code: HTMLElement): string | null {
    const classSources: string[] = [];
    const collect = (el: Element | null) => {
        if (!el) return;
        const cls = el.getAttribute('class');
        if (cls) classSources.push(cls);
    };
    collect(pre);
    collect(code);
    let parent: Element | null = pre.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
        collect(parent);
        parent = parent.parentElement;
    }
    const classBlob = classSources.join(' ');
    const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
        [/\blanguage-(c\+\+)\b/, (m) => m[1]],
        [/\blanguage-([A-Za-z0-9+#_.+-]+)\b/, (m) => m[1]],
        [/\blang-([A-Za-z0-9+#_.-]+)\b/, (m) => m[1]],
        [/\bhighlight-(?:text-|source-)?([a-z0-9]+)(?:-basic)?\b/i, (m) => m[1]],
        [/\bbrush:\s*([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bprettyprint\s+lang-([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bhljs-([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bcode-([a-z0-9]+)\b/i, (m) => m[1]],
    ];
    for (const [re, fn] of patterns) {
        const match = classBlob.match(re);
        if (match) {
            let raw = fn(match);
            if (raw === 'c++') raw = 'c++';
            return normalizeLangAlias(raw);
        }
    }
    return null;
}

function normalizeLangAlias(raw: string): string {
    const l = raw.toLowerCase();
    const aliasMap: Record<string, string> = {
        js: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        jsx: 'jsx',
        ts: 'typescript',
        tsx: 'tsx',
        py: 'python',
        rb: 'ruby',
        cpp: 'cpp',
        cxx: 'cpp',
        'c++': 'cpp',
        c: 'c',
        'c#': 'csharp',
        cs: 'csharp',
        sh: 'bash',
        shell: 'bash',
        zsh: 'bash',
        html: 'html',
        htm: 'html',
        md: 'markdown',
        yml: 'yaml',
        rs: 'rust',
        golang: 'go',
        kt: 'kotlin',
        docker: 'dockerfile',
    };
    return aliasMap[l] || l;
}
