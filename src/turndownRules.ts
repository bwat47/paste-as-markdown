import TurndownService from '@joplin/turndown';
import { LOG_PREFIX } from './constants';

// Exported to allow external toggling (e.g., tests or future settings-driven behavior)
export const ENABLE_INSERT_FIX = true;

// One-time log guards to avoid console spam when patch conditions repeat across multiple pastes/tests.
let loggedInsertAccessWarn = false;
let loggedInsertNotFoundDebug = false;

// Test helper: reset log guards (not exported in build unless tests import directly)
export function __resetInsertRuleLogGuards() {
    loggedInsertAccessWarn = false;
    loggedInsertNotFoundDebug = false;
}

/**
 * GitHub Anchor Insert Rule Fix
 *
 * PROBLEM: GitHub README headings contain anchor links with "text-decoration: underline"
 * styling. @joplin/turndown's built-in insert rule matches these before the link rule can process
 * them, resulting in empty <ins></ins> tags in the markdown output.
 *
 * See: https://github.com/laurent22/joplin/issues/13107
 *
 * SOLUTION: This is now primarily handled by DOM preprocessing in htmlProcessor.ts which removes
 * the text-decoration: underline styling before Turndown sees it. This rule patch remains as
 * a fallback for edge cases.
 *
 * NOTE: Most anchor/heading cleaning is now done in htmlProcessor.ts during DOM preprocessing.
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
 * Apply custom rule adjustments to fix specific conversion issues.
 * Most logic has been moved to DOM preprocessing in htmlProcessor.ts.
 * This now only handles fallback scenarios.
 */
export function applyCustomRules(service: TurndownService): void {
    // Fallback insert rule patch in case DOM preprocessing missed something
    patchInsertRuleForAnchors(service);
}

/**
 * Patches Joplin's built-in insert rule to prevent anchor elements from being
 * converted to <ins> tags due to text-decoration: underline styling.
 * This is now a fallback - primary fix is in htmlProcessor.ts DOM preprocessing.
 */
function patchInsertRuleForAnchors(service: TurndownService): void {
    if (!ENABLE_INSERT_FIX) {
        console.debug(LOG_PREFIX, 'Insert rule fix disabled via feature flag');
        return;
    }

    try {
        const insertRule = findInsertRule(service);
        if (!insertRule) {
            if (!loggedInsertNotFoundDebug) {
                console.debug(LOG_PREFIX, 'Insert rule not found, skipping patch');
                loggedInsertNotFoundDebug = true;
            }
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
        if (!loggedInsertAccessWarn) {
            console.warn(LOG_PREFIX, 'Could not access Turndown rules for insert filter fix');
            loggedInsertAccessWarn = true;
        }
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
