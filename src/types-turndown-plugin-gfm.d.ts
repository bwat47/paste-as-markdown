// Minimal type declarations for turndown-plugin-gfm
// Provides basic shape so we avoid scattered ts-ignore directives.
declare module 'turndown-plugin-gfm' {
    import TurndownService from 'turndown';

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
