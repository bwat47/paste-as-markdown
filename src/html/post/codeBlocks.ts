/**
 * Generic normalization of code blocks copied from various sites (GitHub, GitLab, Bitbucket, Google style, etc.).
 * Responsibilities (post-sanitization):
 *  - Collapse known wrapper containers (e.g. .highlight, .snippet-clipboard-content, .sourceCode, figure.highlight)
 *    so the structure is a simple <pre><code>…</code></pre>
 *  - Ensure a <code> element exists inside each <pre> (some sources emit only <pre>)
 *  - Remove non-code UI/tool elements (copy buttons, toolbars) that would interfere with Turndown
 *  - Remove now-empty code blocks (after neutralization & span stripping earlier) to avoid emitting empty fences
 *  - Infer language from common class patterns and apply a normalized class="language-xxx" (aliases mapped)
 */

import { onlyContains, unwrapElement } from '../shared/dom';
import { isHighlightLanguage } from './highlightLanguages';

// Mark inline <code> elements whose content is only NBSP characters so Turndown doesn't treat them as blank and drop them.
// We replace their text with a sentinel that we later convert back to `&nbsp;` inside markdown cleanup.
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
    convertCodeMirrorEditors(body);
    const pres = findAndUnwrapCodeBlocks(body);
    pres.forEach((pre) => {
        if (unwrapTableWrappedPre(pre)) {
            return;
        }
        ensureCodeElement(pre);
        removeUIElements(pre);
        const code = pre.querySelector('code')!;
        trimCodeWhitespace(code);
        if (isEmptyCodeBlock(code)) {
            pre.remove();
            return;
        }
        normalizeLanguageClass(pre, code);
    });
}

function convertCodeMirrorEditors(body: HTMLElement): void {
    const editors = Array.from(body.querySelectorAll('.cm-editor')) as HTMLElement[];
    editors.forEach((editor) => {
        const content = editor.querySelector('.cm-content') as HTMLElement | null;
        if (!content) return;
        const lineElements = Array.from(content.querySelectorAll('.cm-line')) as HTMLElement[];
        if (lineElements.length === 0) return;

        const lines = lineElements.map((line) => extractCodeMirrorLineText(line));
        const meaningfulContent = lines.some((line) => line.trim() !== '');
        if (!meaningfulContent) return;

        const documentRef = editor.ownerDocument;
        const pre = documentRef.createElement('pre');
        const code = documentRef.createElement('code');
        code.textContent = lines.join('\n');
        pre.appendChild(code);

        const languageHint = (
            content.getAttribute('data-language') ||
            editor.getAttribute('data-language') ||
            ''
        ).trim();
        if (languageHint) {
            const sanitizedHint = languageHint.replace(/^(text|application)\//i, '');
            const normalized =
                normalizeLangAlias(sanitizedHint) ||
                (sanitizedHint.match(/^[a-z0-9+#_.-]{1,40}$/i) ? sanitizedHint.toLowerCase() : null);
            if (normalized) {
                pre.setAttribute('data-pam-wrapper-classes', `language-${normalized}`);
            }
        }

        const parent = editor.parentElement;
        if (parent && onlyContains(parent, editor)) {
            parent.replaceWith(pre);
        } else {
            editor.replaceWith(pre);
        }
    });
}

function extractCodeMirrorLineText(line: HTMLElement): string {
    let text = '';
    for (const node of Array.from(line.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName.toLowerCase() === 'br') {
                continue;
            }
            text += extractCodeMirrorLineText(el);
        }
    }
    return text;
}

function findAndUnwrapCodeBlocks(body: HTMLElement): HTMLElement[] {
    const selectors = [
        'div.highlight',
        'div[class^="highlight-"]',
        'div[class*=" highlight-"]',
        'div.snippet-clipboard-content',
        'div.sourceCode',
        'figure.highlight',
        'figure[class^="highlight-"]',
        'figure[class*=" highlight-"]',
        'pre',
    ];
    const wrappers = Array.from(body.querySelectorAll(selectors.join(', '))) as HTMLElement[];
    const pres: HTMLElement[] = [];
    wrappers.forEach((wrapperEl) => {
        const pre =
            wrapperEl.tagName.toLowerCase() === 'pre'
                ? wrapperEl
                : (wrapperEl.querySelector('pre') as HTMLElement | null);
        if (!pre) return;
        const wrapperClasses = wrapperEl.getAttribute('class');
        if (wrapperClasses) {
            const existing = pre.getAttribute('data-pam-wrapper-classes');
            pre.setAttribute('data-pam-wrapper-classes', existing ? `${existing} ${wrapperClasses}` : wrapperClasses);
        }
        if (pre !== wrapperEl) {
            if (wrapperEl.parentElement && onlyContains(wrapperEl, pre)) {
                wrapperEl.parentElement.replaceChild(pre, wrapperEl);
            } else if (/\bhighlight(?:-|$)/i.test(wrapperEl.className)) {
                wrapperEl.className = wrapperEl.className
                    .split(/\s+/)
                    .filter((cls) => cls && !/^highlight(?:-|$)/i.test(cls))
                    .join(' ');
            }
        }
        pres.push(pre);
    });
    return pres;
}

// Some sources (e.g. claude web chat) wrap tables in pre tags
function unwrapTableWrappedPre(pre: HTMLElement): boolean {
    const table = pre.querySelector('table');
    if (!table) return false;
    if (table.parentElement !== pre) return false;
    if (!onlyContains(pre, table)) return false;
    if (!pre.parentElement) return false;
    unwrapElement(pre);
    return true;
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
    // Ensure the <pre> contains a direct <code> child; if code is nested inside wrappers,
    // hoist the first descendant <code> to be the sole code child before stripping UI wrappers.
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
            // Move the descendant code to be the only relevant child of <pre>
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
    if (element.tagName === 'SPAN') {
        const text = element.textContent ?? '';
        if (text.replace(/[\s\u00A0]+/g, '') === '') {
            return true;
        }
    }
    return (
        /codeblock-button-wrapper|copy|fullscreen|toolbar/i.test(element.className) ||
        element.tagName === 'DIV' ||
        element.tagName === 'BUTTON'
    );
}

function trimCodeWhitespace(code: HTMLElement): void {
    const text = code.textContent ?? '';
    if (!text) return;
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
    const trimmed = lines.join('\n');
    if (trimmed !== text) {
        code.textContent = trimmed;
    }
}

function isEmptyCodeBlock(code: HTMLElement): boolean {
    return !code.textContent || code.textContent.replace(/\s+/g, '') === '';
}

function normalizeLanguageClass(pre: HTMLElement, code: HTMLElement): void {
    const language = inferLanguageFromClasses(pre, code);
    // Remove existing language markers regardless of inference result so we don't leak invalid fences
    const cleaned = code.className
        .split(/\s+/)
        .filter((c) => c && !/^lang(uage)?-/i.test(c) && !/^highlight-source-/i.test(c));
    const cleanedClass = cleaned.join(' ');
    if (cleanedClass) {
        code.className = cleanedClass;
    } else {
        code.removeAttribute('class');
    }
    if (!language) return;
    if (!code.classList.contains(`language-${language}`)) {
        code.classList.add(`language-${language}`);
    }
}

function inferLanguageFromClasses(pre: HTMLElement, code: HTMLElement): string | null {
    const classSources: string[] = [];
    const collect = (el: Element | null, removeWrapperHint = false) => {
        if (!el) return;
        const cls = el.getAttribute('class');
        if (cls) classSources.push(cls);
        const wrapperHint = (el as HTMLElement).getAttribute('data-pam-wrapper-classes');
        if (wrapperHint) {
            classSources.push(wrapperHint);
            if (removeWrapperHint) {
                (el as HTMLElement).removeAttribute('data-pam-wrapper-classes');
            }
        }
    };
    collect(pre, true);
    collect(code, true);
    // also walk up a few ancestors for wrapper language hints
    let parent: Element | null = pre.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
        collect(parent);
        parent = parent.parentElement;
    }
    const classBlob = classSources.join(' ');
    const patterns: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
        // Handle language-c++ explicitly before generic language-* to avoid truncation to 'c'
        [/\blanguage-(c\+\+)\b/, (m) => m[1]],
        [/\blanguage-([A-Za-z0-9+#_.+-]+)\b/, (m) => m[1]],
        [/\blang-([A-Za-z0-9+#_.-]+)\b/, (m) => m[1]],
        [/\bhighlight-source-([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bhighlight-(?:text-)?([a-z0-9]+)(?:-basic)?\b/i, (m) => m[1]],
        [/\bbrush:\s*([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bprettyprint\s+lang-([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bhljs-([a-z0-9]+)\b/i, (m) => m[1]],
        [/\bcode-([a-z0-9]+)\b/i, (m) => m[1]],
    ];
    for (const [re, fn] of patterns) {
        const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
        const globalRe = new RegExp(re.source, flags);
        for (const match of classBlob.matchAll(globalRe)) {
            let raw = fn(match);
            if (!raw) continue;
            // Normalize common punctuation variations before alias mapping (e.g., c++ -> cpp)
            if (raw === 'c++') raw = 'c++';
            const normalized = normalizeLangAlias(raw);
            if (!normalized) continue;
            if (isHighlightLanguage(normalized)) {
                return normalized;
            }
        }
    }
    return null; // Don't guess language from content, joplin already does this when language not specified
}

function normalizeLangAlias(raw: string): string | null {
    const l = raw.toLowerCase();
    const aliasMap: Record<string, string | null> = {
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
        markdown: 'markdown',
        yml: 'yaml',
        tml: 'toml',
        rs: 'rust',
        golang: 'go',
        kt: 'kotlin',
        docker: 'dockerfile',
        plain: 'txt', //txt works to disable syntax highlighting in both joplin md editor and veiwer, text/plaintext only works in viewer
        plain_text: 'txt',
        plaintext: 'txt',
        text: 'txt',
        txt: 'txt',
        default: null,
        none: null,
        auto: null,
        container: null,
        code: null,
        source: null,
        sourcecode: null,
    };
    if (Object.prototype.hasOwnProperty.call(aliasMap, l)) {
        return aliasMap[l];
    }
    if (!/^[a-z0-9+#_.-]{1,40}$/.test(l)) {
        return null;
    }
    return l;
}
