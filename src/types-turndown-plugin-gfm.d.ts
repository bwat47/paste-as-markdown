// Minimal type declarations for Joplin's forked Turndown + GFM plugin.
// This keeps our code type-safe enough without pulling full upstream types.

declare module '@joplin/turndown' {
    class TurndownService {
        constructor(options?: Record<string, unknown>);
        use(plugin: (service: TurndownService) => void): void;
        addRule(
            name: string,
            rule: {
                filter: string | ((node: HTMLElement) => boolean);
                replacement: (content: string, node?: HTMLElement) => string;
            }
        ): void;
        remove(filter: string | ((node: HTMLElement) => boolean)): void;
        turndown(html: string): string;
    }
    export default TurndownService;
}

declare module '@joplin/turndown-plugin-gfm' {
    import TurndownService from '@joplin/turndown';
    interface GfmPlugin {
        (service: TurndownService): void;
        tables(service: TurndownService): void;
        strikethrough(service: TurndownService): void;
        taskListItems(service: TurndownService): void;
    }
    const gfm: GfmPlugin;
    export { gfm };
    export default gfm;
}

// (Legacy) fallback declarations if older packages linger; safe no-op duplicates.
declare module 'turndown-plugin-gfm' {
    import TurndownService from '@joplin/turndown';
    interface GfmPlugin {
        (service: TurndownService): void;
        tables(service: TurndownService): void;
        strikethrough(service: TurndownService): void;
        taskListItems(service: TurndownService): void;
    }
    const gfm: GfmPlugin;
    export { gfm };
    export default gfm;
}
