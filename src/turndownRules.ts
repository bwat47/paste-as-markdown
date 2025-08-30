// src/turndownRules.ts
import type TurndownService from 'turndown';

/**
 * @fileoverview Turndown Rules - Custom conversion rules for HTML to Markdown
 *
 * Contains specialized rules for handling various HTML patterns that don't convert
 * well with default Turndown settings. Rules are organized by category:
 *
 * - Link handling: Empty anchors, complex nested content
 * - Code preservation: Syntax highlighting, inline code
 * - Block elements: Divs, spacing, nested structures
 * - Styling: Spans with formatting, definition lists
 * - Content cleanup: Social widgets, image captions
 *
 * Each rule includes documentation explaining what HTML pattern it addresses
 * and why the custom handling is needed.
 *
 * @author bwat47
 * @since 1.0.0
 */

export interface TurndownRule {
    name: string;
    filter: string | ((node: HTMLElement) => boolean);
    replacement: (content: string, node?: HTMLElement) => string;
    description: string;
}

// Link handling rules
// IMPORTANT: Rule order is intentional.
// dropEmptyAnchors precedes flattenAnchorContent to ensure empty heading/permalink anchors are removed
// before any flattening. Keep removal rules before transformation rules to avoid regressions.
export const linkRules: TurndownRule[] = [
    {
        name: 'dropEmptyAnchors',
        description: 'Remove empty anchor tags (common for heading permalinks) unless they contain images',
        filter: (node: HTMLElement) => {
            if (!node || node.nodeName !== 'A') return false;
            const anchor = node as HTMLAnchorElement;
            if (anchor.querySelector('img')) return false;
            const text = (anchor.textContent || '').replace(/\u00a0/g, ' ').trim();
            return text.length === 0;
        },
        replacement: () => '',
    },
    {
        name: 'dropEmptyHeadingSpans',
        description: 'Remove empty span anchors used only for in-page navigation (e.g., <span id="section"></span>)',
        filter: (node: HTMLElement) => {
            if (!node || node.nodeName !== 'SPAN') return false;
            const span = node as HTMLSpanElement;
            // Must have id or anchor-like class
            const id = span.getAttribute('id') || '';
            const cls = span.className || '';
            const isAnchorish = !!id || /anchor|permalink|heading|section/i.test(cls);
            if (!isAnchorish) return false;
            // If it contains any non-whitespace text after NBSP normalization, keep it
            const text = (span.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (text.length > 0) return false;
            // If it contains non-image child elements with text, keep it (unlikely)
            if (Array.from(span.children).some((c) => /\S/.test(c.textContent || ''))) return false;
            return true;
        },
        replacement: () => '',
    },
    {
        name: 'flattenAnchorContent',
        description: 'Flatten complex nested content inside anchor tags to simple text links',
        filter: (node: HTMLElement) => {
            if (!node || node.nodeName !== 'A') return false;
            const anchor = node as HTMLAnchorElement;
            if (anchor.querySelector('img')) return false;
            const text = (anchor.textContent || '').replace(/\u00a0/g, ' ').trim();
            return text.length > 0 && anchor.children.length > 0;
        },
        replacement: (_content: string, node: HTMLElement) => {
            const anchor = node as HTMLAnchorElement;
            const href = anchor.getAttribute('href') || '';
            const titleAttr = anchor.getAttribute('title');
            const text = (anchor.textContent || '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const safeText = text || href;
            // Truncate excessively long generated link labels to keep markdown readable
            const MAX_LINK_TEXT = 120;
            const displayText =
                safeText.length > MAX_LINK_TEXT ? safeText.slice(0, MAX_LINK_TEXT - 1).trimEnd() + '…' : safeText;
            const titlePart = titleAttr ? ` "${titleAttr.replace(/"/g, '\\"')}"` : '';
            return `[${displayText}](${href}${titlePart})`;
        },
    },
];

// Code preservation rules
export const codeRules: TurndownRule[] = [
    {
        name: 'preserveCodeBlocks',
        description: 'Handle <pre> (with or without nested <code>) preserving raw text and language class',
        filter: (node: HTMLElement) => node.nodeName === 'PRE',
        replacement: (_content: string, node: HTMLElement) => {
            // Support either <pre><code class="language-xxx">...</code></pre> or bare <pre>...</pre>
            const codeElement = node.querySelector('code');
            const languageSource = codeElement || node; // try nested code first, else pre itself
            const className = languageSource.className || '';
            const language = className.match(/(?:language-|lang-)([a-z0-9+_-]+)/i)?.[1] || '';
            // Use raw textContent to avoid prior escaping performed on child nodes
            const raw = (codeElement ? codeElement.textContent : node.textContent) || '';
            // Normalize line endings and trim leading/trailing blank lines while preserving internal indentation
            const normalized = raw.replace(/\r\n?/g, '\n').replace(/^[\n]+|[\n]+$/g, '');
            // Determine required fence length (one longer than any run of backticks in content)
            const backtickRuns: string[] = normalized.match(/`+/g) || [];
            const longestBackticks = backtickRuns.reduce<number>((m, s) => Math.max(m, s.length), 0);
            const fence = '`'.repeat(Math.max(3, longestBackticks + 1)); // at least standard ```
            return `\n\n${fence}${language ? language : ''}\n${normalized}\n${fence}\n\n`;
        },
    },
    {
        name: 'preserveInlineCode',
        description: 'Better handling of inline code with backticks in content',
        filter: (node: HTMLElement) => {
            return node.nodeName === 'CODE' && !node.parentElement?.matches('pre');
        },
        replacement: (content: string) => {
            // Use longest sequence length instead of number of groups to choose a safe wrapper
            const runs: string[] = content.match(/`+/g) || [];
            const longest = runs.reduce<number>((m, s) => Math.max(m, s.length), 0);
            const fence = '`'.repeat(Math.max(1, longest + 1));
            return `${fence}${content}${fence}`;
        },
    },
];

// Block element handling rules
export const blockRules: TurndownRule[] = [
    {
        name: 'handleDivs',
        description: 'Intelligently handle div elements based on content and styling',
        filter: 'div',
        replacement: (content: string, node: HTMLElement) => {
            const div = node as HTMLDivElement;
            const hasBlockChildren = Array.from(div.children).some((child) =>
                ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'].includes(
                    child.nodeName
                )
            );
            const hasBlockStyling = div.style.display === 'block' || div.className.includes('block');
            // Detect div that contains only an <img> (common pattern for inline-block image containers)
            const imageOnly = div.children.length === 1 && div.children[0].nodeName === 'IMG';
            // Treat divs with non-zero margin as block-level separators (e.g., Outlook / email clients use margin: 1em 0)
            const styleAttr = div.getAttribute('style') || '';
            const hasNonZeroMargin = /margin\s*:\s*(?!0(?:[;\s]|$))/i.test(styleAttr);

            if (hasBlockChildren || hasBlockStyling || imageOnly || hasNonZeroMargin) {
                const trimmed = content.trim();
                return trimmed ? `\n\n${trimmed}\n\n` : content;
            }
            return content;
        },
    },
    {
        name: 'cleanupBlockSpacing',
        description: 'Ensure proper spacing around block elements',
        filter: (node: HTMLElement) => {
            return ['BLOCKQUOTE', 'UL', 'OL', 'TABLE'].includes(node.nodeName);
        },
        replacement: (content: string) => {
            return `\n\n${content.trim()}\n\n`;
        },
    },
];

// Content cleanup rules
export const cleanupRules: TurndownRule[] = [
    {
        name: 'dropSocialWidgets',
        description: 'Remove social media embeds and widgets that do not convert meaningfully',
        filter: (node: HTMLElement) => {
            const className = node.className || '';
            const id = node.id || '';
            return /(?:twitter-tweet|fb-post|instagram-media|social-embed|widget|ad-banner)/i.test(
                className + ' ' + id
            );
        },
        replacement: () => '',
    },
];

// Image removal
export const imageRules: TurndownRule[] = [
    {
        name: 'dropImages',
        description: 'Remove all image elements when image inclusion is disabled',
        filter: 'img',
        replacement: () => '',
    },
];

// All rules combined for easy application
export const allRules: TurndownRule[] = [...linkRules, ...codeRules, ...blockRules, ...cleanupRules];

/**
 * Apply a set of rules to a TurndownService instance
 */
export function applyRules(service: TurndownService, rules: TurndownRule[]): void {
    for (const rule of rules) {
        try {
            service.addRule(rule.name, {
                filter: rule.filter,
                replacement: rule.replacement,
            });
        } catch (err) {
            console.warn(`[paste-as-markdown] Failed to apply rule '${rule.name}':`, err);
        }
    }
}

/**
 * Apply all rules to a TurndownService instance
 */
export function applyAllRules(service: TurndownService, options?: { includeImages?: boolean }): void {
    applyRules(service, linkRules);
    applyRules(service, codeRules);
    applyRules(service, blockRules);
    applyRules(service, cleanupRules);

    // Only drop images if includeImages is explicitly false
    if (options?.includeImages === false) {
        applyRules(service, imageRules);
    }
}
