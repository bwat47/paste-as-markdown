import type { PasteOptions, ResourceConversionMeta } from './types';
import { LOG_PREFIX, MAX_IMAGE_BYTES } from './constants';
import createDOMPurify from 'dompurify';
import { buildSanitizerConfig } from './sanitizerConfig';

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
        if (!body) return { html, resources: { resourcesCreated: 0, resourceIds: [] } };

        // 3. Post-sanitization semantic adjustments (things DOMPurify doesn't do)
        if (!options.includeImages) {
            // DOMPurify already dropped disallowed image tags if configured, but ensure anchors referencing only images are cleaned.
            removeEmptyAnchors(body);
        }
        // Style-based semantic inference intentionally skipped; rely on existing semantic tags only.
        cleanHeadingAnchors(body);
        normalizeWhitespaceCharacters(body);
        normalizeCodeBlocks(body);

        // Image handling
        let resourceIds: string[] = [];
        if (options.includeImages) {
            if (options.convertImagesToResources) {
                resourceIds = await convertImagesToResources(body);
                // Standardize any images that were not converted (e.g., SVGs or failures)
                standardizeRemainingImages(body);
            } else {
                // No conversion requested; standardize all included images
                standardizeRemainingImages(body);
            }
        }
        return { html: body.innerHTML, resources: { resourcesCreated: resourceIds.length, resourceIds } };
    } catch (err) {
        console.warn(LOG_PREFIX, 'DOM preprocessing failed, falling back to raw HTML:', (err as Error)?.message || err);
        return { html, resources: { resourcesCreated: 0, resourceIds: [] } };
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

// ---- Image resource conversion helpers ----
interface ParsedImageData {
    buffer: ArrayBuffer;
    mime: string;
    filename: string;
}

async function convertImagesToResources(body: HTMLElement): Promise<string[]> {
    const imgs = Array.from(body.querySelectorAll('img[src]')).filter((img) => {
        const src = img.getAttribute('src') || '';
        return src && !src.startsWith(':/') && (src.startsWith('data:') || /^https?:\/\//i.test(src));
    });
    const ids: string[] = [];
    for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        try {
            let data: ParsedImageData | null = null;
            if (src.startsWith('data:')) data = await parseBase64Image(src);
            else if (/^https?:\/\//i.test(src)) data = await downloadExternalImage(src);
            if (!data) continue;
            // Skip SVGs for now – they are text, small, and often remote badges. Avoid resource conversion complications.
            const id = await createJoplinResource(data);
            img.setAttribute('src', `:/${id}`);
            standardizeImageElement(img as HTMLImageElement, data.filename);
            ids.push(id);
        } catch (e) {
            console.warn(LOG_PREFIX, 'Failed to convert image to resource', src, e);
        }
    }
    return ids;
}

function standardizeImageElement(img: HTMLImageElement, originalFilename: string): void {
    // Preserve existing alt if present, else derive from original filename (strip extension underscores -> spaces optional?)
    const existingAlt = (img.getAttribute('alt') || '').trim();
    if (!existingAlt) {
        const base = originalFilename.replace(/\.[a-z0-9]{2,5}$/i, '');
        img.setAttribute('alt', sanitizeAltText(base));
    }
    // Remove all non-whitelisted attributes
    const allowed = new Set(['src', 'alt', 'width', 'height']);
    for (const attr of Array.from(img.attributes)) {
        if (!allowed.has(attr.name.toLowerCase())) img.removeAttribute(attr.name);
    }
    // Reorder attributes: src, alt, width, height
    const srcVal = img.getAttribute('src') || '';
    const altVal = img.getAttribute('alt');
    const widthVal = img.getAttribute('width');
    const heightVal = img.getAttribute('height');
    // Remove all allowed then re-add in canonical order
    ['src', 'alt', 'width', 'height'].forEach((a) => img.removeAttribute(a));
    if (srcVal) img.setAttribute('src', srcVal);
    if (altVal) img.setAttribute('alt', altVal);
    if (widthVal) img.setAttribute('width', widthVal);
    if (heightVal) img.setAttribute('height', heightVal);
}

function standardizeRemainingImages(body: HTMLElement): void {
    const imgs = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];
    imgs.forEach((img) => {
        // Skip if already standardized to resource form (src starts with :/ and has only whitelisted attrs already processed)
        // We still re-run to enforce attribute order if not previously processed.
        const src = img.getAttribute('src') || '';
        const filename = deriveOriginalFilename(src) || 'image';
        standardizeImageElement(img, filename);
    });
}

function deriveOriginalFilename(src: string): string {
    if (src.startsWith('data:')) return 'pasted';
    if (src.startsWith(':/')) return 'resource';
    try {
        const u = new URL(src, 'https://placeholder.local'); // base for relative URLs
        const last = u.pathname.split('/').filter(Boolean).pop() || 'image';
        return last.split('?')[0].split('#')[0];
    } catch {
        return 'image';
    }
}

function sanitizeAltText(raw: string): string {
    // Remove control chars, trim, collapse internal excessive whitespace, limit length
    let out = raw.replace(/[\x00-\x1F\x7F]/g, '');
    out = out.replace(/\s+/g, ' ').trim();
    if (!out) out = 'image';
    // Cap to 120 chars to avoid excessive alt text
    if (out.length > 120) out = out.slice(0, 117) + '...';
    return out;
}

async function parseBase64Image(dataUrl: string): Promise<ParsedImageData> {
    const match = dataUrl.match(/^data:([^;]+)(?:;charset=[^;]+)?;base64,(.+)$/i);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1].toLowerCase();
    if (!mime.startsWith('image/')) throw new Error('Not image');
    let b64 = match[2];
    // Strip whitespace (defensive) and validate charset
    b64 = b64.replace(/\s+/g, '');
    if (/[^A-Za-z0-9+/=]/.test(b64)) throw new Error('Invalid base64 characters');
    // Basic padding validation
    if (b64.length % 4 === 1) throw new Error('Malformed base64 length');
    // Rough size estimate before full decode: each 4 base64 chars -> 3 bytes
    const estimatedBytes = Math.floor((b64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    let binary: string;
    try {
        binary = atob(b64);
    } catch {
        throw new Error('Base64 decode failed');
    }
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    return { buffer: bytes.buffer, mime, filename: `pasted.${extensionForMime(mime)}` };
}

async function downloadExternalImage(url: string): Promise<ParsedImageData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('Not image');
    const contentLengthHeader = resp.headers.get('content-length');
    if (contentLengthHeader) {
        const asInt = parseInt(contentLengthHeader, 10);
        if (!isNaN(asInt) && asInt > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
    }
    // Stream & enforce limit
    const reader = resp.body?.getReader();
    if (!reader) {
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds maximum size');
        const filenameImmediate = deriveFilenameFromUrl(url, extensionForMime(contentType));
        return { buffer, mime: contentType, filename: filenameImmediate };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            received += value.length;
            if (received > MAX_IMAGE_BYTES) {
                controller.abort();
                throw new Error('Image exceeds maximum size');
            }
        }
    }
    const merged = concatChunks(chunks, received);
    const filename = deriveFilenameFromUrl(url, extensionForMime(contentType));
    return { buffer: merged, mime: contentType, filename };
}

function deriveFilenameFromUrl(url: string, fallbackExt: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop() || '';
        if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
        return `pasted.${fallbackExt}`;
    } catch {
        return `pasted.${fallbackExt}`;
    }
}

function extensionForMime(mime: string): string {
    const map: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/bmp': 'bmp',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
    };
    return map[mime] || 'bin';
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out.buffer;
}

async function createJoplinResource(img: ParsedImageData): Promise<string> {
    // Creating a resource via the data API expects a file path. The previous attempt passed
    // an in‑memory multipart part with a synthetic path which Joplin core attempted to read
    // from disk (createResourceFromPath) resulting in "Cannot access data". Here we persist
    // a temporary file under the plugin data directory, post it, then delete it.
    // @ts-expect-error joplin global provided at runtime
    const dataDir: string = await joplin.plugins.dataDir();
    // Attempt to load fs-extra (available in plugin sandbox). If not available, abort conversion.
    interface FsExtraLike {
        writeFileSync?: (path: string, data: Uint8Array | Buffer) => void;
        writeFile?: (path: string, data: Uint8Array | Buffer, cb: (err?: Error | null) => void) => void;
        existsSync?: (path: string) => boolean;
        unlink?: (path: string, cb: (err?: Error | null) => void) => void;
    }
    let fs: FsExtraLike;
    try {
        // @ts-expect-error joplin global provided at runtime
        fs = joplin.require('fs-extra');
    } catch (e) {
        console.warn(LOG_PREFIX, 'fs-extra unavailable; skipping image resource conversion');
        throw e;
    }

    const ext = img.filename.split('.').pop() || extensionForMime(img.mime);
    const tmpName = `pam-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    // Build path manually to avoid depending on 'path' module (not available in sandbox on some platforms)
    const normalizedDir = dataDir.replace(/\\/g, '/');
    const tmpPath = `${normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/'}${tmpName}`;

    interface FsLike {
        writeFileSync?: (path: string, data: Uint8Array | Buffer) => void;
        writeFile?: (path: string, data: Uint8Array | Buffer, cb: (err?: Error | null) => void) => void;
        existsSync?: (path: string) => boolean;
        unlink?: (path: string, cb: (err?: Error | null) => void) => void;
    }
    const fsLike: FsLike = fs as unknown as FsLike;

    try {
        const buffer =
            typeof Buffer !== 'undefined' ? Buffer.from(new Uint8Array(img.buffer)) : new Uint8Array(img.buffer);
        // Write synchronously (small files, sequential processing, keeps logic simple)
        if (typeof fsLike.writeFileSync === 'function') {
            fsLike.writeFileSync(tmpPath, buffer);
        } else if (typeof fsLike.writeFile === 'function') {
            await new Promise<void>((resolve, reject) => {
                fsLike.writeFile!(tmpPath, buffer, (err) => (err ? reject(err) : resolve()));
            });
        } else {
            throw new Error('fs write unavailable');
        }
        // Post resource pointing to the temp file path
        // @ts-expect-error joplin global provided at runtime
        const resource = await joplin.data.post(['resources'], null, { title: img.filename, mime: img.mime }, [
            { path: tmpPath },
        ]);
        return resource.id;
    } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to create resource from temp file', e);
        throw e;
    } finally {
        try {
            if (fsLike.existsSync?.(tmpPath)) fsLike.unlink?.(tmpPath, () => {});
        } catch (cleanupErr) {
            console.warn(LOG_PREFIX, 'Temp file cleanup failed', cleanupErr);
        }
    }
}
