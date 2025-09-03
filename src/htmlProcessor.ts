import type { PasteOptions } from './types';
import { LOG_PREFIX } from './constants';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from './sanitizerConfig';

/**
 * DOM-based HTML preprocessing for cleaning and sanitizing HTML before Turndown conversion.
 * This centralizes all HTML manipulations that were previously scattered across Turndown rules
 * and post-processing regex operations.
 */
export function processHtml(html: string, options: PasteOptions): string {
    // Safety wrapper: if DOM APIs unavailable, return original.
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
    try {
        // 1. Sanitize first with DOMPurify (drops scripts, event handlers, dangerous URIs, optionally images)
        const purifier = createDOMPurify(window as unknown as typeof window);
        const sanitized = purifier.sanitize(
            html,
            buildSanitizerConfig({ includeImages: options.includeImages })
        ) as string;

        // 2. Parse sanitized HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized, 'text/html');
        const body = doc.body;
        if (!body) return html;

        // 3. Post-sanitization semantic adjustments (things DOMPurify doesn't do)
        if (!options.includeImages) {
            // DOMPurify already dropped disallowed image tags if configured, but ensure anchors referencing only images are cleaned.
            removeEmptyAnchors(body);
        }
        // Style-based semantic inference intentionally skipped; rely on existing semantic tags only.
        cleanHeadingAnchors(body);
        normalizeWhitespaceCharacters(body);
        normalizeCodeBlocks(body);
        return body.innerHTML;
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        return html;
    }
}

// DOMPurify already strips scripts/styles and (optionally) images; no extra removal needed here.

/**
 * Remove anchor elements that become empty after image removal
 */
function removeEmptyAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
        const textContent = anchor.textContent?.trim() || '';
        const hasNonImageChildren = Array.from(anchor.children).some(
            (child) => !['img', 'picture', 'source'].includes(child.tagName.toLowerCase())
        );

        // Remove anchors that have no text content and no non-image children
        if (textContent.length === 0 && !hasNonImageChildren) {
            anchor.remove();
        }
    });
}
/**
 * Clean GitHub-style permalink anchors and heading links.
 * Migrated from turndownRules.ts cleanHeadingAnchors functionality.
 */
function cleanHeadingAnchors(body: HTMLElement): void {
    const anchors = body.querySelectorAll('a');
    anchors.forEach((anchor) => {
        const { isPermalink, insideHeading } = analyzeAnchor(anchor);

        if (isPermalink) {
            // Remove permalink anchors entirely
            anchor.remove();
        } else if (insideHeading) {
            // Unwrap heading links - replace with their content
            unwrapElement(anchor);
        }
    });
}

/**
 * Analyze an anchor element to determine permalink / heading context.
 * Migrated from turndownRules.ts
 */
function analyzeAnchor(node: HTMLElement): { isPermalink: boolean; insideHeading: boolean } {
    const parent = node.parentElement;
    const clsRaw = node.getAttribute('class') || '';
    const classes = clsRaw ? clsRaw.split(/\s+/).filter(Boolean) : [];
    const hasAnchorClass = classes.includes('anchor');
    const href = (node.getAttribute('href') || '').trim();
    const id = (node.getAttribute('id') || '').trim();
    const text = (node.textContent || '').trim();

    const isPermalink =
        hasAnchorClass &&
        ((href.startsWith('#') && href.length > 1) || id.startsWith('user-content-')) &&
        text.length === 0;

    const insideHeading = !!parent && /^H[1-6]$/.test(parent.nodeName);

    return { isPermalink, insideHeading };
}

/**
 * Unwrap an element by replacing it with its children
 */
function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;

    // Move all children before the element
    while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
    }

    // Remove the now-empty element
    parent.removeChild(element);
}

/**
 * Generic normalization of code blocks copied from various sites (GitHub, GitLab, Bitbucket, Google style, etc.).
 * Goals:
 *  - Collapse wrapper divs (e.g. .highlight, .snippet-clipboard-content, .code-wrapper) so only <pre><code> remains
 *  - Ensure a <code> element exists inside each <pre>
 *  - Infer language from common class/name patterns and add a standardized class="language-xxx"
 *  - Decode HTML entities inside HTML code blocks so Markdown fence shows real tags
 */
function normalizeCodeBlocks(body: HTMLElement): void {
    const wrappers = Array.from(
        body.querySelectorAll('div.highlight, div.snippet-clipboard-content, div.sourceCode, figure.highlight, pre')
    );
    wrappers.forEach((wrapper) => {
        // Identify the <pre>
        const wrapperEl = wrapper as HTMLElement;
        const pre: HTMLElement | null =
            wrapperEl.tagName.toLowerCase() === 'pre'
                ? wrapperEl
                : (wrapperEl.querySelector('pre') as HTMLElement | null);
        if (!pre) return;
        // Unwrap single-pre wrappers
        if (pre !== wrapperEl && wrapperEl.parentElement && onlyContains(wrapperEl, pre)) {
            wrapperEl.parentElement.replaceChild(pre, wrapperEl);
        }
        // Ensure <code>
        let code = pre.querySelector('code');
        if (!code) {
            code = pre.ownerDocument.createElement('code');
            // Move children of pre into code
            while (pre.firstChild) code.appendChild(pre.firstChild);
            pre.appendChild(code);
        }
        // Remove non-code UI helper elements (e.g., copy/fullscreen button toolbars) that some forums inject
        // because Turndown may downgrade a <pre> with mixed children to inline code. Keep only the <code> element.
        for (const child of Array.from(pre.children)) {
            if (child !== code) {
                // Heuristic: known wrapper/button containers or any div/button sibling
                if (
                    /codeblock-button-wrapper|copy|fullscreen|toolbar/i.test(child.className) ||
                    child.tagName === 'DIV' ||
                    child.tagName === 'BUTTON'
                ) {
                    child.remove();
                }
            }
        }
        // Flatten GitHub-style token spans: if every non-empty child element is a span.pl-* then replace with plain textContent.
        if (
            code.children.length > 0 &&
            Array.from(code.children).every((el) => el.tagName.toLowerCase() === 'span' && /\bpl-/.test(el.className))
        ) {
            const text = code.textContent || '';
            code.textContent = text; // replaces inner HTML, dropping span markup while preserving decoded characters
        } else if (code.childElementCount === 1 && code.firstElementChild?.tagName.toLowerCase() === 'span') {
            // Single-wrapper span case (keep previous behavior)
            const span = code.firstElementChild as HTMLElement;
            code.textContent = span.textContent || span.innerText || '';
        }
        // If after normalization the code block has no visible text (empty or whitespace), remove the entire pre.
        if (!code.textContent || code.textContent.replace(/\s+/g, '') === '') {
            pre.remove();
            return; // Skip further processing for this block
        }
        // Derive language using explicit class-based detection only (no content heuristics).
        const language = inferLanguageFromClasses(pre, code);
        if (language) {
            // Remove any existing language- or lang- prefixed classes to avoid duplication
            code.className = code.className
                .split(/\s+/)
                .filter((c) => c && !/^lang(uage)?-/i.test(c) && !/^highlight-source-/i.test(c))
                .join(' ');
            if (!code.classList.contains(`language-${language}`)) code.classList.add(`language-${language}`);
        }
    });
}

function onlyContains(wrapper: Element, child: Element): boolean {
    const kids = Array.from(wrapper.childNodes).filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim())
    );
    return kids.length === 1 && kids[0] === child;
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
    // also walk up a few ancestors for wrapper language hints
    let parent: Element | null = pre.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
        collect(parent);
        parent = parent.parentElement;
    }
    const classBlob = classSources.join(' ');
    const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
        // Handle language-c++ explicitly before generic language-* to avoid truncation to 'c'
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
            // Normalize common punctuation variations before alias mapping (e.g., c++ -> cpp)
            if (raw === 'c++') raw = 'c++';
            return normalizeLangAlias(raw);
        }
    }
    return null; // Let downstream renderer auto-detect
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

/**
 * Normalize whitespace characters to ensure proper rendering in markdown
 * Convert various NBSP encodings to regular spaces for better markdown compatibility
 */
function normalizeWhitespaceCharacters(body: HTMLElement): void {
    // Fast bail-out: if no NBSP / encoded variants present skip full tree walk.
    const snapshot = body.innerHTML;
    if (!/[Â\u00A0]|&nbsp;/.test(snapshot)) return;
    // Walk through all text nodes and normalize whitespace characters
    const doc = body.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);

    const textNodesToUpdate: { node: Text; newText: string }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const textNode = node as Text;
        const originalText = textNode.textContent || '';

        // Skip normalization inside code elements to preserve semantic whitespace
        const parentElement = textNode.parentElement;
        if (
            parentElement &&
            (parentElement.tagName.toLowerCase() === 'code' ||
                parentElement.tagName.toLowerCase() === 'pre' ||
                parentElement.closest('code, pre'))
        ) {
            continue;
        }

        // Normalize various NBSP representations to regular spaces
        // This handles UTF-8 encoded NBSP (Â ) and Unicode NBSP (\u00A0)
        const normalizedText = originalText
            .replace(/Â\s/g, ' ') // UTF-8 encoded NBSP + space -> regular space
            .replace(/\u00A0/g, ' ') // Unicode NBSP -> regular space
            .replace(/&nbsp;/g, ' '); // HTML entity -> regular space

        if (normalizedText !== originalText) {
            textNodesToUpdate.push({ node: textNode, newText: normalizedText });
        }
    }

    // Apply the updates (done separately to avoid modifying while iterating)
    textNodesToUpdate.forEach(({ node, newText }) => {
        node.textContent = newText;
    });
}
