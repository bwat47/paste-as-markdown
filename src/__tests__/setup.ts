// Set up DOM environment for tests (Joplin runs in Electron with native DOM APIs)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).DOMParser = window.DOMParser;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Node = window.Node;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).NodeFilter = window.NodeFilter;
