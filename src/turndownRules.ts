import TurndownService from '@joplin/turndown';

/**
 * Apply custom rule adjustments to fix specific conversion issues
 */
export function applyCustomRules(service: TurndownService): void {
    // Remove permalink anchors (GitHub-style anchor links that are not useful in markdown)
    service.addRule('removePermalinkAnchors', {
        filter: function (node: HTMLElement) {
            return (
                node.nodeName === 'A' && node.getAttribute('class')?.includes('anchor') && !node.textContent?.trim() // No meaningful text content
            );
        },
        replacement: function () {
            return ''; // Remove completely
        },
    });

    // Fix for anchor tags with text-decoration: underline being converted to <ins> instead of links
    // Issue: GitHub anchor elements (like permalink anchors) have "text-decoration: underline" style
    // which causes Joplin's insert rule to match them before the link rule can process them

    // Access the rules array and find the insert rule
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
            console.warn('[paste-as-markdown] Could not access Turndown rules for insert filter fix');
            return;
        }

        // Find and modify the insert rule
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            if (rule.filter && typeof rule.filter === 'function') {
                const filterStr = rule.filter.toString();
                // This is a bit of a hack, but it's the most reliable way to identify
                // the rule that handles underlined text, which we need to modify.
                // We're looking for the function that checks for `text-decoration: underline`.
                if (filterStr.includes('text-decoration') && filterStr.includes('underline')) {
                    const originalFilter = rule.filter;
                    rule.filter = function (node: HTMLElement, options?: unknown) {
                        // Don't process anchor tags as insert elements
                        if (
                            node.nodeName === 'A' &&
                            (node.getAttribute('href') || node.getAttribute('name') || node.getAttribute('id'))
                        ) {
                            return false;
                        }
                        return originalFilter.call(this, node, options);
                    };
                    console.debug('[paste-as-markdown] Applied insert rule fix for anchor elements');
                    break;
                }
            }
        }
    } catch (error) {
        console.warn('[paste-as-markdown] Failed to apply insert rule fix:', error);
        // Continue without the fix - not critical for basic functionality
    }
}
