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
    interface RuleType {
        filter?: string | ((node: HTMLElement, options?: unknown) => boolean);
        replacement?: (content: string, node?: HTMLElement, options?: unknown) => string;
    }
    const rules = (service as unknown as { rules: { array: RuleType[] } }).rules.array;

    // Find the insert rule by looking for the specific filter pattern
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.filter && typeof rule.filter === 'function') {
            const filterStr = rule.filter.toString();
            // Check if this is the insert rule by looking for the specific text-decoration logic
            if (filterStr.includes('text-decoration') && filterStr.includes('underline')) {
                // Replace the filter function to exclude anchor elements
                const originalFilter = rule.filter;
                rule.filter = function (node: HTMLElement, options?: unknown) {
                    // Don't process anchor tags with href/id/name as insert elements
                    if (
                        node.nodeName === 'A' &&
                        (node.getAttribute('href') || node.getAttribute('name') || node.getAttribute('id'))
                    ) {
                        return false;
                    }

                    // Use the original filter logic for other elements
                    return originalFilter.call(this, node, options);
                };
                break;
            }
        }
    }
}
