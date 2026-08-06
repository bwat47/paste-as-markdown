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

import { onlyContains, unwrapElement, isHtmlElement, isTextNode, isElement } from '../shared/dom';
import { isHighlightLanguage } from './highlightLanguages';

/** Attribute used to carry a collapsed wrapper's classes onto the <pre> for later language inference. */
const WRAPPER_CLASSES_ATTR = 'data-pam-wrapper-classes';

/** How many ancestors to walk when looking for language labels / wrapper class hints. */
const MAX_ANCESTOR_DEPTH = 3;

/** Colon variants (ASCII and fullwidth) that may trail a language label, e.g. `js:` / `js：`. */
const LABEL_COLON_CHARS = new Set([':', '：']);

/**
 * Class patterns that expose a language name in capture group 1, ordered by specificity.
 *
 * The `language-`/`lang-` names end on `[A-Za-z0-9+#]` rather than `\b` so punctuated languages survive:
 * `\b` cannot match after `+` or `#`, so `language-c++` would otherwise backtrack and truncate to `c`.
 * Requiring a token character last also keeps a trailing separator out of the capture (`language-js-` -> `js`).
 */
const LANGUAGE_CLASS_PATTERNS: readonly RegExp[] = [
    /\blanguage-([A-Za-z0-9+#_.-]*[A-Za-z0-9+#])/g,
    /\blang-([A-Za-z0-9+#_.-]*[A-Za-z0-9+#])/g,
    /\bhighlight-source-([a-z0-9]+)\b/gi,
    /\bhighlight-(?:text-)?([a-z0-9]+)(?:-basic)?\b/gi,
    /\bbrush:\s*([a-z0-9]+)\b/gi,
    /\bprettyprint\s+lang-([a-z0-9]+)\b/gi,
    /\bhljs-([a-z0-9]+)\b/gi,
    /\bcode-([a-z0-9]+)\b/gi,
];

/** Outcome of scanning an element's previous siblings for a language label. */
type LabelScanResult =
    | { status: 'found'; language: string }
    | { status: 'blocked' } // a sibling carries real content, so no label can precede this block
    | { status: 'continue' };

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
        removeAdjacentUIContainers(pre);
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

        const parent = editor.parentElement;
        if (parent && onlyContains(parent, editor)) {
            parent.replaceWith(pre);
        } else {
            editor.replaceWith(pre);
        }
    });
}

function extractCodeMirrorLineText(line: Element): string {
    let text = '';
    for (const node of Array.from(line.childNodes)) {
        if (isTextNode(node)) {
            text += node.textContent || '';
        } else if (isElement(node)) {
            if (node.tagName.toLowerCase() === 'br') {
                continue;
            }
            text += extractCodeMirrorLineText(node);
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
            const existing = pre.getAttribute(WRAPPER_CLASSES_ATTR);
            pre.setAttribute(WRAPPER_CLASSES_ATTR, existing ? `${existing} ${wrapperClasses}` : wrapperClasses);
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

function removeAdjacentUIContainers(pre: HTMLElement): void {
    let sibling: Element | null = pre.previousElementSibling;
    let attempts = 0;
    while (sibling && attempts < 3) {
        if (!isHtmlElement(sibling)) {
            sibling = sibling.previousElementSibling;
            continue;
        }
        if (!isUiToolbarWrapper(sibling)) {
            break;
        }
        sibling.remove();
        attempts += 1;
        sibling = pre.previousElementSibling;
    }
}

function isUiToolbarWrapper(element: HTMLElement): boolean {
    if (element.querySelector('pre, code')) {
        return false;
    }
    const className = element.className || '';
    if (
        /\b(copy|clipboard|code[-_]?header|code[-_]?toolbar|snippet-controls|code-actions|toolbar)\b/i.test(className)
    ) {
        return true;
    }
    const button = element.querySelector('button, [role="button"]') as HTMLElement | null;
    if (button) {
        const buttonClasses = button.className || '';
        if (/\bcopy|clipboard\b/i.test(buttonClasses)) {
            return true;
        }
        const label = normalizeNbsp(button.textContent).trim().toLowerCase();
        if (label === 'copy' || label.startsWith('copy ')) {
            return true;
        }
    }
    const text = normalizeNbsp(element.textContent).trim().toLowerCase();
    return text === 'copy' || text === 'copy code';
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
    const labelLanguage = consumeLanguageLabel(pre);
    const languageFromClasses = inferLanguageFromClasses(pre, code);
    // Priority: class-based detection > label-based detection
    // Rationale: Classes are explicit semantic markers, labels might be decorative headers
    const language = languageFromClasses ?? labelLanguage;
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

function consumeLanguageLabel(pre: HTMLElement): string | null {
    let current: HTMLElement | null = pre;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth++) {
        const scan = scanPreviousSiblingsForLabel(current);
        if (scan.status === 'found') return scan.language;
        if (scan.status === 'blocked') return null;
        const parent = current.parentElement as HTMLElement | null;
        if (!parent || !onlyContains(parent, current)) {
            break;
        }
        current = parent;
    }
    return null;
}

/** Walks backwards over `element`'s siblings looking for a bare language label, consuming it when found. */
function scanPreviousSiblingsForLabel(element: HTMLElement): LabelScanResult {
    let sibling: Element | null = element.previousElementSibling;
    while (sibling) {
        if (isHtmlElement(sibling)) {
            const language = extractLanguageFromLabelElement(sibling);
            if (language) {
                consumeLabelElement(sibling);
                return { status: 'found', language };
            }
            if (hasMeaningfulText(sibling)) {
                return { status: 'blocked' };
            }
        }
        sibling = sibling.previousElementSibling;
    }
    return { status: 'continue' };
}

function consumeLabelElement(label: HTMLElement): void {
    const parent = label.parentElement as HTMLElement | null;
    label.remove();
    if (parent) {
        removeEmptyAncestors(parent);
    }
}

function extractLanguageFromLabelElement(element: HTMLElement): string | null {
    const tag = element.tagName.toLowerCase();
    if (tag !== 'div' && tag !== 'span') {
        return null;
    }
    const content = element.textContent ?? '';
    if (!content) {
        return null;
    }
    const trimmed = normalizeNbsp(content).trim();
    if (!trimmed) {
        return null;
    }
    const withoutTrailingColon = stripTrailingColons(trimmed).trim();
    if (!withoutTrailingColon || /\s/.test(withoutTrailingColon)) {
        return null;
    }
    const normalized = normalizeLangAlias(withoutTrailingColon);
    if (!normalized) {
        return null;
    }
    if (!isHighlightLanguage(normalized)) {
        return null;
    }
    return normalized;
}

/**
 * Drops trailing colon characters, e.g. `js::` -> `js`.
 * Done with an index scan rather than a `/[:：]+$/` replace, which backtracks quadratically on long inputs.
 */
function stripTrailingColons(text: string): string {
    let end = text.length;
    while (end > 0 && LABEL_COLON_CHARS.has(text[end - 1])) {
        end -= 1;
    }
    return text.slice(0, end);
}

function hasMeaningfulText(element: HTMLElement): boolean {
    const content = element.textContent ?? '';
    const text = normalizeNbsp(content).trim();
    return text.length > 0;
}

function removeEmptyAncestors(start: HTMLElement): void {
    let current: HTMLElement | null = start;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth++) {
        if (current.tagName === 'BODY' || current.tagName === 'HTML') {
            break;
        }
        if (current.children.length > 0) break;
        const content = current.textContent ?? '';
        const text = normalizeNbsp(content).trim();
        if (text) break;
        const parent = current.parentElement as HTMLElement | null;
        current.remove();
        current = parent;
        if (!current) break;
    }
}

function inferLanguageFromClasses(pre: HTMLElement, code: HTMLElement): string | null {
    const classBlob = collectClassSources(pre, code).join(' ');
    for (const pattern of LANGUAGE_CLASS_PATTERNS) {
        const language = matchLanguageInClasses(classBlob, pattern);
        if (language) return language;
    }
    return null; // Don't guess language from content, joplin already does this when language not specified
}

/** Collects class strings from the block itself plus a few ancestors, consuming the wrapper hints it reads. */
function collectClassSources(pre: HTMLElement, code: HTMLElement): string[] {
    const sources: string[] = [];
    const collect = (el: Element | null, consumeWrapperHint = false) => {
        if (!el) return;
        const cls = el.getAttribute('class');
        if (cls) sources.push(cls);
        const wrapperHint = el.getAttribute(WRAPPER_CLASSES_ATTR);
        if (wrapperHint) {
            sources.push(wrapperHint);
            if (consumeWrapperHint) {
                el.removeAttribute(WRAPPER_CLASSES_ATTR);
            }
        }
    };
    collect(pre, true);
    collect(code, true);
    // also walk up a few ancestors for wrapper language hints
    let parent: Element | null = pre.parentElement;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH && parent; i++) {
        collect(parent);
        parent = parent.parentElement;
    }
    return sources;
}

/** Returns the first match of `pattern` that maps to a known highlight language, e.g. `language-js` -> `javascript`. */
function matchLanguageInClasses(classBlob: string, pattern: RegExp): string | null {
    for (const match of classBlob.matchAll(pattern)) {
        const normalized = normalizeLangAlias(match[1]);
        if (normalized && isHighlightLanguage(normalized)) {
            return normalized;
        }
    }
    return null;
}

function normalizeLangAlias(raw: string): string | null {
    const l = raw.toLowerCase();
    const aliasMap: Record<string, string | null> = {
        js: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        ts: 'typescript',
        py: 'python',
        rb: 'ruby',
        cxx: 'cpp',
        'c++': 'cpp',
        'c#': 'csharp',
        cs: 'csharp',
        sh: 'bash',
        shell: 'bash',
        zsh: 'bash',
        htm: 'html',
        md: 'markdown',
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

function normalizeNbsp(text: string | null | undefined): string {
    return (text ?? '').replace(/\u00A0/g, ' ');
}
