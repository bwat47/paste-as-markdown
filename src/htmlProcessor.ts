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
        // We intentionally DO NOT attempt style-based semantic inference. Rely solely on existing <b>/<strong>/<i>/<em> tags.
        cleanHeadingAnchors(body);
        normalizeWhitespaceCharacters(body);
        normalizeCodeBlocks(body);

        return body.innerHTML;
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        return html;
    }
}

/**
 * Remove script and style elements entirely as they should never be converted
 */
// (Removed) removeScriptAndStyleElements: DOMPurify already strips script/style elements.

// (Removed) removeImageElements: DOMPurify exclusion + no longer needed.

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
 * Fix the Joplin insert rule bug by removing text-decoration: underline from anchor elements.
 * This prevents the insert rule from matching anchor elements and creating empty <ins> tags.
 */
// (Removed) fixJoplinInsertRuleBug: style attributes are stripped; underline styling no longer reaches Turndown.

// (Removed) applySemanticTransformations: style inference intentionally dropped.

/**
 * Safely get computed styles, falling back to inline styles if needed
 */
// (Removed) getComputedStyleSafely

/**
 * Check if element has bold styling
 */
// (Removed) isBoldStyle

/**
 * Check if element has italic styling
 */
// (Removed) isItalicStyle

/**
 * Convert a span element to a semantic element
 */
// (Removed) convertSpanToElement

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
        body.querySelectorAll(
            'div.highlight, div.snippet-clipboard-content, div.code, div.sourceCode, figure.highlight, pre'
        )
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
        // Derive language
        const language = inferLanguage(pre, code);
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

function inferLanguage(pre: HTMLElement, code: HTMLElement): string | null {
    const classSources: string[] = [];
    const collect = (el: Element | null) => {
        if (!el) return;
        const cls = el.getAttribute('class');
        if (cls) classSources.push(cls);
    };
    collect(pre);
    collect(code);
    // also walk up two ancestors for wrapper language hints
    let parent: Element | null = pre.parentElement;
    for (let i = 0; i < 2 && parent; i++) {
        collect(parent);
        parent = parent.parentElement;
    }
    const classBlob = classSources.join(' ');
    const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
        [/language-([A-Za-z0-9+#_-]+)/, (m) => m[1]],
        [/lang-([A-Za-z0-9+#_-]+)/, (m) => m[1]],
        [/highlight-(?:text|source)-([a-z0-9]+)(?:-basic)?/i, (m) => m[1]],
        [/brush:([a-z0-9]+)/i, (m) => m[1]], // SyntaxHighlighter legacy
    ];
    for (const [re, fn] of patterns) {
        const m = classBlob.match(re);
        if (m) return normalizeLang(fn(m));
    }
    // Shebang detection if no explicit class
    const firstLine = (code.textContent || '').split(/\n/)[0];
    if (/^#!.*\b(bash|sh)\b/.test(firstLine)) return 'bash';
    if (/^#!.*\bpython/.test(firstLine)) return 'python';
    // Heuristic: contains HTML tags typical of examples (script/style/div) -> html
    const raw = code.innerHTML;
    if (/<script\b|<style\b|<div\b|<span\b|&lt;script\b/i.test(raw)) return 'html';
    return null;
}

function normalizeLang(raw: string): string {
    const l = raw.toLowerCase();
    const map: Record<string, string> = {
        js: 'javascript',
        jsx: 'jsx',
        ts: 'typescript',
        py: 'python',
        rb: 'ruby',
        cpp: 'cpp',
        c: 'c',
        'c#': 'csharp',
        sh: 'bash',
        shell: 'bash',
        html: 'html',
        htm: 'html',
        md: 'markdown',
    };
    if (l === 'c++') return 'cpp';
    return map[l] || l;
}

// (Removed) decodeBasicEntitiesInCode: superseded by span token flattening using textContent

/**
 * Remove all style attributes to prevent CSS parsing errors in Turndown
 * Since we're converting to Markdown, inline styles aren't needed anyway
 */
// (Removed) removeStyleAttributes: DOMPurify forbids style attributes via FORBID_ATTR.

/**
 * Normalize whitespace characters to ensure proper rendering in markdown
 * Convert various NBSP encodings to regular spaces for better markdown compatibility
 */
function normalizeWhitespaceCharacters(body: HTMLElement): void {
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

/**
 * Remove elements that contain only whitespace and have no meaningful child elements
 * Inspired by Obsidian paste-reformatter plugin's cleaner approach
 */
// (Removed) removeEmptyElements: rely on natural DOM text structure.

/**
 * Check if an element is effectively empty using a recursive approach
 * Based on the cleaner pattern from the Obsidian plugin
 */
// (Removed) isElementEmpty

/**
 * Simplified check for elements that provide meaningful spacing between content
 * Much cleaner than the previous complex adjacency detection
 */
// (Removed) isSpacingElement

/**
 * Context detection - check if element is positioned between meaningful content
 * Handles both direct siblings and parent-level context for nested cases
 */
// (Removed) hasContentContext

/**
 * Check if element provides spacing in its local context (either within parent or parent's context)
 */
// (Removed) hasLocalSpacingContext

/**
 * Check if parent is an inline element that could be providing spacing context
 */
// (Removed) isInlineParent
