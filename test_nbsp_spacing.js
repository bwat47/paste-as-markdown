// Test the NBSP spacing issue
const { JSDOM } = require('jsdom');
const { convertHtmlToMarkdown } = require('./dist/src/markdownConverter.js');

// Set up DOM like in tests
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.window = dom.window;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;

// Simplified test case
const testHtml = `<p><a href="https://paypal.com"><img src="donate.svg" alt="Donate using PayPal"></a><span>Â </span><a href="https://github.com"><img src="sponsor.svg" alt="Sponsor on GitHub"></a></p>`;

console.log('Input HTML:', testHtml);

const result = convertHtmlToMarkdown(testHtml, true);
console.log('Output Markdown:', JSON.stringify(result));

// Check if there's any spacing between the links
const hasSpacing = result.includes(']() [') || result.includes(']) [') || result.includes('] [');
console.log('Has spacing between links:', hasSpacing);