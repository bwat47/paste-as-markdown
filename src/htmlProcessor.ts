import type { PasteOptions, ResourceConversionMeta } from './types';
import { LOG_PREFIX } from './constants';
import { convertImagesToResources, standardizeRemainingImages } from './resourceConverter';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from './sanitizerConfig';
import { normalizeAltText } from './textUtils';

/**
 * DOM-based HTML preprocessing for cleaning and sanitizing HTML before Turndown conversion.
 * This centralizes all HTML manipulations that were previously scattered across Turndown rules
 * and post-processing regex operations.
 */
export async function processHtml(
    html: string,
    options: PasteOptions
): Promise<{ html: string; resources: ResourceConversionMeta }> {
    // Safety wrapper: if DOM APIs unavailable, return original.
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
        return { html, resources: { resourcesCreated: 0, resourceIds: [] } };
    try {
        // Phase 1: Parse raw HTML first to allow safe neutralization of code blocks BEFORE sanitization.
        // Rationale: If we sanitize first, literal examples containing <script> / <style> can be stripped
        // entirely. By converting code block innerHTML to plain text now, we ensure DOMPurify only
        // sees escaped entities (&lt;script&gt;...), preserving instructional code samples.
        const rawParser = new DOMParser();
        const rawDoc = rawParser.parseFromString(html, 'text/html');
        const rawBody = rawDoc.body;
        if (!rawBody) return { html, resources: { resourcesCreated: 0, resourceIds: [] } };
        // Normalize text characters on the raw DOM before any structural changes.
        // This ensures top-level text (e.g., headings/paragraphs) gets normalized
        // regardless of how later code-block neutralization and sanitization
        // might restructure the DOM. This pass skips code/pre.
        try {
            normalizeTextCharacters(rawBody, options.normalizeQuotes);
        } catch {
            // Non-fatal: if early normalization fails on odd DOMs, continue.
        }
        neutralizeCodeBlocksPreSanitize(rawBody);

        // Serialize the neutralized DOM back to a string for sanitization
        const intermediate = rawBody.innerHTML;

        // Phase 2: Sanitize the neutralized HTML (drops scripts, dangerous attributes, optional images)
        const purifier = createDOMPurify(window as unknown as typeof window);
        const sanitized = purifier.sanitize(
            intermediate,
            buildSanitizerConfig({ includeImages: options.includeImages })
        ) as string;

        // Phase 3: Parse sanitized HTML for semantic post-processing
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized, 'text/html');
        const body = doc.body;
        if (!body) return { html, resources: { resourcesCreated: 0, resourceIds: [] } };

        // Phase 4: Post-sanitization adjustments
        if (!options.includeImages) removeEmptyAnchors(body);
        cleanHeadingAnchors(body);
        normalizeTextCharacters(body, options.normalizeQuotes);
        normalizeCodeBlocks(body); // still run to collapse highlight spans / infer language
        markNbspOnlyInlineCode(body);
        // Word sometimes injects line breaks into image alt attributes via character refs (e.g., &#10;)
        // which decode to real newlines and break Markdown image syntax. Normalize to single spaces.
        normalizeImageAltAttributes(body);

        // Phase 5: Image handling (conversion + normalization)
        let resourceIds: string[] = [];
        let attempted = 0;
        let failed = 0;
        if (options.includeImages) {
            if (options.convertImagesToResources) {
                const result = await convertImagesToResources(body);
                resourceIds = result.ids;
                attempted = result.attempted;
                failed = result.failed;
                standardizeRemainingImages(body);
            } else {
                standardizeRemainingImages(body);
            }
            // Re-normalize alt attributes in case later steps reintroduced undesirable whitespace
            normalizeImageAltAttributes(body);
        }
        return {
            html: body.innerHTML,
            resources: { resourcesCreated: resourceIds.length, resourceIds, attempted, failed },
        };
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        if (err instanceof Error && (err as Error).stack) {
            console.warn((err as Error).stack);
        }
        return { html, resources: { resourcesCreated: 0, resourceIds: [] } };
    }
}

// Mark inline <code> elements whose content is only NBSP characters so Turndown doesn't treat them as blank and drop them.
// We replace their text with a sentinel that we later convert back to `&nbsp;` inside markdown cleanup.
function markNbspOnlyInlineCode(body: HTMLElement): void {
    const codes = Array.from(body.querySelectorAll('code')) as HTMLElement[];
    codes.forEach((code) => {
        if (code.parentElement && code.parentElement.tagName === 'PRE') return; // skip fenced blocks
        const text = code.textContent || '';
        if (!text) return;
        // If text consists solely of NBSP (unicode or entity form if somehow preserved) and ordinary spaces
        const hasNbsp = /\u00A0/.test(text);
        if (hasNbsp && text.replace(/\u00A0|\s/g, '') === '') {
            code.textContent = '__PAM_NBSP__';
        }
    });
}

// Note: unwrapBlockContainersInTableCells function removed - let GFM plugin handle all table cell processing

// DOMPurify already strips scripts/styles and (optionally) images; no extra removal needed here.

/**
 * Neutralize raw code block content prior to sanitization so literal examples of tags like
 * <script> or <style> are preserved as text instead of being removed by DOMPurify.
 * Strategy: For each <pre> (and nested <code> if present), take its current innerHTML and
 * assign it to textContent, effectively escaping any tag structures. This drops existing
 * highlight spans (acceptable – markdown cannot represent them) while keeping visual code.
 * We purposefully do not touch already-empty blocks.
 */
function neutralizeCodeBlocksPreSanitize(body: HTMLElement): void {
    const pres = Array.from(body.querySelectorAll('pre')) as HTMLElement[];
    pres.forEach((pre) => {
        // Find <code> child if present; else operate on <pre> directly.
        const code = pre.querySelector('code') as HTMLElement | null;
        const target = code || pre;
        if (!target) return;
        // Build text manually so <br> becomes a newline rather than disappearing.
        const collect = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.tagName.toLowerCase() === 'br') return '\n';
                // Skip elements that do not contribute (e.g. purely styling spans) but still traverse children.
                let out = '';
                for (const child of Array.from(el.childNodes)) out += collect(child);
                return out;
            }
            return '';
        };
        const text = collect(target);
        if (!text.trim()) return;
        target.textContent = text;
    });
}

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
 * Responsibilities (post-sanitization):
 *  - Collapse known wrapper containers (e.g. .highlight, .snippet-clipboard-content, .sourceCode, figure.highlight)
 *    so the structure is a simple <pre><code>…</code></pre>
 *  - Ensure a <code> element exists inside each <pre> (some sources emit only <pre>)
 *  - Remove non-code UI/tool elements (copy buttons, toolbars) that would interfere with Turndown
 *  - Remove now-empty code blocks (after neutralization & span stripping earlier) to avoid emitting empty fences
 *  - Infer language from common class patterns and apply a normalized class="language-xxx" (aliases mapped)
 *  - Preserve literal tag text that was already neutralized earlier (no additional entity decoding is performed here)
 */
function normalizeCodeBlocks(body: HTMLElement): void {
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

        // Unwrap if wrapper only contains this pre
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
        if (child !== code && shouldRemoveUIElement(child)) {
            child.remove();
        }
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

    // Remove existing language classes
    code.className = code.className
        .split(/\s+/)
        .filter((c) => c && !/^lang(uage)?-/i.test(c) && !/^highlight-source-/i.test(c))
        .join(' ');

    if (!code.classList.contains(`language-${language}`)) {
        code.classList.add(`language-${language}`);
    }
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
 * Normalize text characters commonly found in rich document sources:
 * - Various NBSP representations to regular spaces
 * - Word/Office smart quotes to regular quotes (optional)
 * - Other problematic encoded characters
 * Skips code elements to preserve literal character examples.
 */
function normalizeTextCharacters(body: HTMLElement, normalizeQuotes: boolean = true): void {
    // Build the bail-out regex conditionally
    const nbspPattern = /[Â\u00A0]|&nbsp;/;
    const quotePattern = /&#8220|&#8221|&#8216|&#8217|[\u201C\u201D\u2018\u2019]/;
    const bailOutPattern = normalizeQuotes ? new RegExp(`${nbspPattern.source}|${quotePattern.source}`) : nbspPattern;
    // Fast bail-out: if no NBSP / encoded variants or quote entities present skip full tree walk.
    const snapshot = body.innerHTML;
    if (!bailOutPattern.test(snapshot)) return;

    // Walk through all text nodes and normalize text characters
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
        // Normalize various NBSP representations (always applied)
        let normalizedText = originalText
            // NBSP normalization
            .replace(/Â\s/g, ' ') // UTF-8 encoded NBSP + space -> regular space
            .replace(/\u00A0/g, ' ') // Unicode NBSP -> regular space
            .replace(/&nbsp;/g, ' '); // HTML entity -> regular space

        // Quote normalization (conditional)
        if (normalizeQuotes) {
            normalizedText = normalizedText
                .replace(/&#8220;?/g, '"') // Left double quote
                .replace(/&#8221;?/g, '"') // Right double quote
                .replace(/&#8216;?/g, "'") // Left single quote
                .replace(/&#8217;?/g, "'") // Right single quote
                // Unicode versions (in case they're already decoded)
                .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
                .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes
        }

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
 * Normalize <img alt> attributes by removing line breaks and control characters that
 * can break Markdown image syntax. Collapses all whitespace runs to a single space.
 */
function normalizeImageAltAttributes(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach((img) => {
        const alt = img.getAttribute('alt');
        if (alt == null) return;
        const normalized = normalizeAltText(alt);
        if (normalized !== alt) img.setAttribute('alt', normalized);
    });
}
