// Simple mock for GFM plugin that provides basic table & task list functionality for tests
// Minimal explicit types instead of any to satisfy lint rules.

type Filter = string | ((node: Element) => boolean);

interface Rule {
    filter: Filter;
    replacement: (content: string, node: Element) => string;
}

interface TurndownServiceLike {
    addRule(name: string, rule: Rule): void;
}

export async function getGfmPlugin(): Promise<(service: TurndownServiceLike) => void> {
    return function gfmMock(service: TurndownServiceLike): void {
        service.addRule('table', {
            filter: 'table',
            replacement: function (content: string): string {
                return '\n' + content + '\n';
            },
        });

        service.addRule('thead', {
            filter: 'thead',
            replacement: function (content: string): string {
                return content;
            },
        });

        service.addRule('tbody', {
            filter: 'tbody',
            replacement: function (content: string): string {
                return content;
            },
        });

        service.addRule('tr', {
            filter: 'tr',
            replacement: function (content: string, node: Element): string {
                const isHeaderRow = !!node.parentNode && (node.parentNode as Element).nodeName === 'THEAD';
                const result = '|' + content + '\n';

                if (isHeaderRow) {
                    const cellCount = (content.match(/\|/g) || []).length;
                    const separator = '|' + Array(cellCount + 1).join(' --- |') + '\n';
                    return result + separator;
                }
                return result;
            },
        });

        service.addRule('th', {
            filter: 'th',
            replacement: function (content: string): string {
                return ' ' + content + ' |';
            },
        });

        service.addRule('td', {
            filter: 'td',
            replacement: function (content: string): string {
                return ' ' + content + ' |';
            },
        });

        service.addRule('taskListItems', {
            filter: function (node: Element): boolean {
                return node.nodeName === 'LI' && !!node.querySelector('input[type="checkbox"]');
            },
            replacement: function (content: string, node: Element): string {
                const checkbox = node.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                const isChecked = !!checkbox && (checkbox.checked || checkbox.getAttribute('checked') !== null);
                const taskMarker = isChecked ? '[x] ' : '[ ] ';
                const cleanContent = content.replace(/<input[^>]*>/gi, '').trim();
                return '- ' + taskMarker + cleanContent + '\n';
            },
        });

        service.addRule('checkbox', {
            filter: function (node: Element): boolean {
                return node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox';
            },
            replacement: function (): string {
                return '';
            },
        });
    };
}
