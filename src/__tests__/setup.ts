// Test setup file
import { JSDOM } from 'jsdom';

// Set up DOM environment for tests (Joplin runs in Electron with native DOM APIs)
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).DOMParser = dom.window.DOMParser;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = dom.window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Node = dom.window.Node;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).NodeFilter = dom.window.NodeFilter;
