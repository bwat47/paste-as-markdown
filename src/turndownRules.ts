import TurndownService from '@joplin/turndown';
import { LOG_PREFIX } from './constants';

// Exported to allow external toggling (e.g., tests or future settings-driven behavior)
export const ENABLE_INSERT_FIX = true;

/**
 * GitHub Anchor Insert Rule Fix
 *
 * PROBLEM: GitHub README headings contain anchor links with "text-decoration: underline"
 * styling. @joplin/turndown's built-in insert rule matches these before the link rule can process
 * them, resulting in empty <ins></ins> tags in the markdown output.
 *
 * SOLUTION: Patch the existing insert rule to exclude anchor elements, allowing the
 * link rule to handle them properly.
 *
 * This approach was chosen after trying:
 * - Post-processing removal (failed: removed <ins> from code blocks)
 * - Pre-processing HTML cleanup (failed to prevent issue from ocurring)
 */

interface TurndownRule {
    filter?: RuleFilter;
    replacement?: (content: string, node?: HTMLElement) => string;
}

type RuleFilter = ((node: HTMLElement, options?: unknown) => boolean) & {
    _anchorPatched?: boolean;
};

interface TurndownServiceInternal {
    rules?: {
        array?: TurndownRule[];
    };
}

/**
 * Analyze an anchor element to determine permalink / heading context.
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
 * Apply custom rule adjustments to fix specific conversion issues
 */
export function applyCustomRules(service: TurndownService): void {
    addCleanHeadingAnchorsRule(service);
    patchInsertRuleForAnchors(service);
}

/**
 * Adds rule to clean GitHub-style permalink anchors and unwrap heading links
 */
function addCleanHeadingAnchorsRule(service: TurndownService): void {
    service.addRule('cleanHeadingAnchors', {
        filter: function (node: HTMLElement) {
            if (node.nodeName !== 'A') return false;
            const { isPermalink, insideHeading } = analyzeAnchor(node);
            return isPermalink || insideHeading;
        },
        replacement: function (content: string, node: HTMLElement) {
            // Decide between removal (permalink) vs unwrap (inside heading or normal link)
            const { isPermalink } = analyzeAnchor(node);
            return isPermalink ? '' : content;
        },
    });
}

/**
 * Patches Joplin's built-in insert rule to prevent anchor elements from being
 * converted to <ins> tags due to text-decoration: underline styling.
 */
function patchInsertRuleForAnchors(service: TurndownService): void {
    if (!ENABLE_INSERT_FIX) {
        console.debug(LOG_PREFIX, 'Insert rule fix disabled via feature flag');
        return;
    }

    try {
        const insertRule = findInsertRule(service);
        if (!insertRule) {
            console.debug(LOG_PREFIX, 'Insert rule not found, skipping patch');
            return;
        }

        if (isAlreadyPatched(insertRule)) {
            console.debug(LOG_PREFIX, 'Insert rule already patched');
            return;
        }

        applyInsertRulePatch(insertRule);
        console.debug(LOG_PREFIX, 'Applied insert rule fix for anchor elements');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(LOG_PREFIX, 'Failed to apply insert rule fix:', msg);
    }
}

/**
 * Finds Joplin's built-in insert rule by examining rule behavior
 */
function findInsertRule(service: TurndownService): TurndownRule | null {
    const serviceInternal = service as unknown as TurndownServiceInternal;
    const rules = serviceInternal.rules?.array;

    if (!rules || !Array.isArray(rules)) {
        console.warn(LOG_PREFIX, 'Could not access Turndown rules for insert filter fix');
        return null;
    }

    // Look for rule that matches underlined elements
    for (const rule of rules) {
        if (!rule.filter || typeof rule.filter !== 'function') continue;

        // Check if this looks like the insert rule by examining its string representation
        const filterStr = rule.filter.toString().toLowerCase();
        if (filterStr.includes('text-decoration') && filterStr.includes('underline')) {
            return rule;
        }
    }

    return null;
}

/**
 * Checks if the insert rule has already been patched
 */
function isAlreadyPatched(rule: TurndownRule): boolean {
    return !!(rule.filter as RuleFilter)?._anchorPatched;
}

/**
 * Applies the patch to the insert rule
 */
function applyInsertRulePatch(rule: TurndownRule): void {
    if (!rule.filter || typeof rule.filter !== 'function') {
        console.debug(LOG_PREFIX, 'Insert rule has no functional filter; skipping patch');
        return;
    }

    const originalFilter = rule.filter as RuleFilter;

    const patchedFilter = function (this: unknown, node: HTMLElement, options?: unknown): boolean {
        // Skip anchor elements - let the link rule handle them
        if (isAnchorElement(node)) {
            return false;
        }

        // Otherwise, use original insert rule logic
        return originalFilter.call(this, node, options);
    } as RuleFilter;

    // Mark as patched to prevent duplicate patches
    patchedFilter._anchorPatched = true;
    rule.filter = patchedFilter;
}

/**
 * Determines if an element is an anchor that should be handled by link rules
 */
function isAnchorElement(node: HTMLElement): boolean {
    return (
        node.nodeName === 'A' && !!(node.getAttribute('href') || node.getAttribute('name') || node.getAttribute('id'))
    );
}
