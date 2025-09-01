import TurndownService from '@joplin/turndown';
import { LOG_PREFIX } from './constants';

const ENABLE_INSERT_FIX = true;

/**
 * Apply custom rule adjustments to fix specific conversion issues
 */
export function applyCustomRules(service: TurndownService): void {
    // Consolidated rule:
    // 1. Remove empty permalink anchors (GitHub-style <a class="anchor" href="#..."></a>)
    // 2. Unwrap (keep text of) links that appear inside headings (so heading text isn't a link)
    service.addRule('cleanHeadingAnchors', {
        filter: function (node: HTMLElement) {
            if (node.nodeName !== 'A') return false;
            const parent = node.parentElement;
            const cls = node.getAttribute('class') || '';
            const hasAnchorClass = cls.split(/\s+/).includes('anchor');
            const href = (node.getAttribute('href') || '').trim();
            const id = (node.getAttribute('id') || '').trim();
            const text = (node.textContent || '').trim();
            const isPermalink =
                hasAnchorClass &&
                ((href.startsWith('#') && href.length > 1) || id.startsWith('user-content-')) &&
                text.length === 0;
            if (isPermalink) return true; // remove entirely
            const insideHeading = !!parent && /^H[1-6]$/.test(parent.nodeName);
            if (insideHeading) return true; // unwrap
            return false;
        },
        replacement: function (content: string, node: HTMLElement) {
            // Re-run minimal permalink check to decide between removal vs unwrap
            const cls = node.getAttribute('class') || '';
            const hasAnchorClass = cls.split(/\s+/).includes('anchor');
            const href = (node.getAttribute('href') || '').trim();
            const id = (node.getAttribute('id') || '').trim();
            const text = (node.textContent || '').trim();
            const isPermalink =
                hasAnchorClass &&
                ((href.startsWith('#') && href.length > 1) || id.startsWith('user-content-')) &&
                text.length === 0;
            return isPermalink ? '' : content;
        },
    });

    // Fix for anchor tags with text-decoration: underline being converted to <ins> instead of links
    // Issue: GitHub anchor elements (like permalink anchors) have "text-decoration: underline" style
    // which causes Joplin's insert rule to match them before the link rule can process them

    // Access the rules array and find the insert rule
    if (ENABLE_INSERT_FIX) {
        try {
            const serviceWithRules = service as unknown as {
                rules: {
                    array: Array<{
                        filter?: string | ((node: HTMLElement, options?: unknown) => boolean);
                        replacement?: (content: string, node?: HTMLElement, options?: unknown) => string;
                    }>;
                };
            };

            const rules = serviceWithRules.rules?.array;
            if (!rules || !Array.isArray(rules)) {
                console.warn(LOG_PREFIX, 'Could not access Turndown rules for insert filter fix');
            } else {
                for (let i = 0; i < rules.length; i++) {
                    const rule = rules[i];
                    if (!rule.filter || typeof rule.filter !== 'function') continue;
                    if ((rule.filter as unknown as { _anchorPatched?: boolean })._anchorPatched) continue; // idempotent
                    const filterStr = rule.filter.toString().toLowerCase();
                    if (filterStr.includes('text-decoration') && filterStr.includes('underline')) {
                        const originalFilter = rule.filter;
                        const patched = function (this: unknown, node: HTMLElement, options?: unknown) {
                            if (
                                node.nodeName === 'A' &&
                                (node.getAttribute('href') || node.getAttribute('name') || node.getAttribute('id'))
                            ) {
                                return false; // let link rule handle it
                            }
                            return (
                                originalFilter as (this: unknown, node: HTMLElement, options?: unknown) => boolean
                            ).call(this, node, options);
                        } as typeof rule.filter & { _anchorPatched?: boolean };
                        patched._anchorPatched = true;
                        rule.filter = patched;
                        console.debug(LOG_PREFIX, 'Applied insert rule fix for anchor elements');
                        break;
                    }
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(LOG_PREFIX, 'Failed to apply insert rule fix:', msg);
        }
    }
}
