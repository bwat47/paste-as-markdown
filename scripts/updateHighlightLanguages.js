#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Fetches Highlight.js' SUPPORTED_LANGUAGES.md, drops rows that require third-party packages, normalizes aliases (including
 * wrapper slug fallback), and rewrites src/html/post/highlightLanguages.ts with the sorted allowlist plus an updated retrieval date.
 */

'use strict';

const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');

const SOURCE_URL = 'https://raw.githubusercontent.com/highlightjs/highlight.js/refs/heads/main/SUPPORTED_LANGUAGES.md';
const OUTPUT_PATH = path.resolve(__dirname, '../src/html/post/highlightLanguages.ts');

function fetchSupportedLanguages(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    resolve(fetchSupportedLanguages(res.headers.location));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to fetch ${url}: status ${res.statusCode}`));
                    res.resume();
                    return;
                }

                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            })
            .on('error', reject);
    });
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/&/g, 'and')
        .replace(/['"`’]/g, '')
        .replace(/[^a-z0-9+#_.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function parseLanguages(markdown) {
    const identifiers = new Set();
    const lines = markdown.split(/\r?\n/);

    for (const line of lines) {
        if (!line.startsWith('|')) continue;
        if (/^\|\s*:/.test(line)) continue; // alignment row

        const cols = line.split('|').map((part) => part.trim());
        if (cols.length < 4) continue;

        const language = cols[1];
        const aliasColumn = cols[2];
        const packageColumn = cols[3];

        if (!language || language === 'Language') continue;
        if (packageColumn) continue; // skip third-party packages

        const aliases = aliasColumn
            ? aliasColumn
                  .split(',')
                  .map((entry) => entry.trim().toLowerCase())
                  .filter(Boolean)
            : [];

        const slug = slugify(language);
        if (slug && !aliases.includes(slug)) {
            aliases.push(slug);
        }

        aliases.forEach((alias) => identifiers.add(alias));
    }

    return Array.from(identifiers).sort();
}

function renderFile(languages, retrievedOn) {
    const header = `/**\n * Highlight.js core language identifiers and aliases (no third-party packages).\n * Source: ${SOURCE_URL}\n * Retrieved: ${retrievedOn} (update when Joplin bumps highlight.js).\n */`;

    const items = languages.map((lang) => `    '${lang}',`).join('\n');

    return `${header}\n\nconst LANGUAGE_IDENTIFIERS = [\n${items}\n] as const;\n\nconst HIGHLIGHT_LANGUAGES = new Set<string>(LANGUAGE_IDENTIFIERS);\n\nexport function isHighlightLanguage(id: string): boolean {\n    return HIGHLIGHT_LANGUAGES.has(id.toLowerCase());\n}\n\nexport function getHighlightLanguages(): ReadonlySet<string> {\n    return HIGHLIGHT_LANGUAGES;\n}\n`;
}

async function main() {
    try {
        const markdown = await fetchSupportedLanguages(SOURCE_URL);
        const languages = parseLanguages(markdown);
        if (languages.length === 0) {
            throw new Error('No highlight.js languages parsed; aborting update.');
        }
        const today = new Date().toISOString().slice(0, 10);
        const fileContents = renderFile(languages, today);
        fs.writeFileSync(OUTPUT_PATH, `${fileContents}\n`, 'utf8');
        console.log(`Updated ${path.relative(process.cwd(), OUTPUT_PATH)} with ${languages.length} entries.`);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}
