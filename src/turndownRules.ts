import TurndownService from '@joplin/turndown';

const LOG_PREFIX = '[paste-as-markdown]';
const ENABLE_INSERT_FIX = true;

/**
 * Apply custom rule adjustments to fix specific conversion issues
 */
export function applyCustomRules(service: TurndownService): void {
    // Remove permalink anchors (GitHub-style <a class="anchor" href="#...">)
    service.addRule('removePermalinkAnchors', {
        filter: function (node: HTMLElement) {
            if (node.nodeName !== 'A') return false;
            const cls = node.getAttribute('class') || '';
            const hasAnchorClass = cls.split(/\s+/).includes('anchor');
            if (!hasAnchorClass) return false;
            const href = node.getAttribute('href') || '';
            const id = node.getAttribute('id') || '';
            const looksLikePermalink = (href.startsWith('#') && href.length > 1) || id.startsWith('user-content-');
            if (!looksLikePermalink) return false;
            const text = (node.textContent || '').trim();
            if (text.length > 0) return false; // Has visible text; keep it
            return true;
        },
        replacement: () => '',
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
