// Simple mock for GFM plugin that provides basic table functionality for tests
export async function getGfmPlugin() {
    return function gfmMock(service: any) {
        // Simplified table conversion that preserves <br> tags as expected by tests
        service.addRule('table', {
            filter: 'table',
            replacement: function (content: string) {
                return '\n' + content + '\n';
            }
        });

        service.addRule('thead', {
            filter: 'thead',
            replacement: function (content: string) {
                return content;
            }
        });

        service.addRule('tbody', {
            filter: 'tbody',
            replacement: function (content: string) {
                return content;
            }
        });

        service.addRule('tr', {
            filter: 'tr',
            replacement: function (content: string, node: any) {
                const isHeaderRow = node.parentNode && node.parentNode.nodeName === 'THEAD';
                const result = '|' + content + '\n';
                
                if (isHeaderRow) {
                    // Add separator line after header
                    const cellCount = (content.match(/\|/g) || []).length;
                    const separator = '|' + Array(cellCount + 1).join(' --- |') + '\n';
                    return result + separator;
                }
                return result;
            }
        });

        service.addRule('th', {
            filter: 'th',
            replacement: function (content: string) {
                return ' ' + content + ' |';
            }
        });

        service.addRule('td', {
            filter: 'td', 
            replacement: function (content: string) {
                return ' ' + content + ' |';
            }
        });

        // Handle task list items - list items containing checkboxes
        service.addRule('taskListItems', {
            filter: function (node: any) {
                return node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]');
            },
            replacement: function (content: string, node: any) {
                const checkbox = node.querySelector('input[type="checkbox"]');
                const isChecked = checkbox && (checkbox.checked || checkbox.getAttribute('checked') !== null);
                const taskMarker = isChecked ? '[x] ' : '[ ] ';
                // Remove checkbox from content and clean up
                const cleanContent = content.replace(/<input[^>]*>/gi, '').trim();
                return '- ' + taskMarker + cleanContent + '\n';
            }
        });

        // Handle standalone checkboxes (remove them since they're handled by parent LI)
        service.addRule('checkbox', {
            filter: function (node: any) {
                return node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox';
            },
            replacement: function () {
                return ''; // Remove checkbox inputs - they're handled by the LI rule
            }
        });
    };
}