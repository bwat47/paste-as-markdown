// Set up DOM environment for tests (Joplin runs in Electron with native DOM APIs)
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
globalThis.NodeFilter = window.NodeFilter;
