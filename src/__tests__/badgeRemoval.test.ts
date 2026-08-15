import { afterEach, describe, expect, test, vi } from 'vitest';
import { processHtml } from '../html/processHtml';
import { removeBadgeImages } from '../html/post/badges';
import * as resourceConverter from '../resourceConverter';
import { pasteOptions } from './helpers/pasteOptions';

const JOPLIN_DONATION_BADGES = `
    <h1>Creating a table of contents plugin</h1>
    <div>
        <p>
            <a href="https://www.paypal.com/donate/?hosted_button_id=WQCERTSSLCC7U" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="https://raw.githubusercontent.com/laurent22/joplin/dev/Assets/WebsiteAssets/images/badges/Donate-PayPal-green.svg" alt="Donate using PayPal"/>
            </a>
            &nbsp;
            <a href="https://github.com/sponsors/laurent22/" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="https://raw.githubusercontent.com/laurent22/joplin/dev/Assets/WebsiteAssets/images/badges/GitHub-Badge.svg" alt="Sponsor on GitHub"/>
            </a>
            &nbsp;
            <a href="https://www.patreon.com/joplin" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="https://raw.githubusercontent.com/laurent22/joplin/dev/Assets/WebsiteAssets/images/badges/Patreon-Badge.svg" alt="Become a patron"/>
            </a>
            &nbsp;
            <a href="https://joplinapp.org/donate/#donations" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="https://raw.githubusercontent.com/laurent22/joplin/dev/Assets/WebsiteAssets/images/badges/Donate-IBAN.svg" alt="Donate using IBAN"/>
            </a>
        </p>
    </div>
    <p>This tutorial will guide you through the steps to create a table of contents plugin for Joplin.</p>
`;

const GITHUB_CAMO_BADGES = `
    <div dir="auto">
        <h1 tabindex="-1" dir="auto">is-badge</h1>
    </div>
    <p dir="auto">
        <a href="https://github.com/wooorm/is-badge/actions">
            <img src="https://github.com/wooorm/is-badge/workflows/main/badge.svg" alt="Build"/>
        </a>
        &nbsp;
        <a href="https://codecov.io/github/wooorm/is-badge" rel="nofollow">
            <img src="https://camo.githubusercontent.com/fd62176a5c7543366f5cfb552afa818a644ca3ca2f6174c1885d8fd51b212044/68747470733a2f2f696d672e736869656c64732e696f2f636f6465636f762f632f6769746875622f776f6f6f726d2f69732d62616467652e737667" alt="Coverage"/>
        </a>
        &nbsp;
        <a href="https://www.npmjs.com/package/is-badge" rel="nofollow">
            <img src="https://camo.githubusercontent.com/34da7e66efb2c470b777e9f6787b4643d3541cdbf4a91bde1e4e0a939b1581c5/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f646d2f69732d62616467652e737667" alt="Downloads"/>
        </a>
        &nbsp;
        <a href="https://bundlephobia.com/result?p=is-badge" rel="nofollow">
            <img src="https://camo.githubusercontent.com/a3b0d924952bcbf7397779e95276aa3998298b7092bc7b67f0c3de2703691ad0/68747470733a2f2f696d672e736869656c64732e696f2f62756e646c6570686f6269612f6d696e7a69702f69732d62616467652e737667" alt="Size"/>
        </a>
    </p>
`;

function makeBody(html: string): HTMLElement {
    return new DOMParser().parseFromString(html, 'text/html').body;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('badge removal', () => {
    test('removes GitHub workflow and camo-proxied badge images', async () => {
        const result = await processHtml(GITHUB_CAMO_BADGES, pasteOptions({ removeBadges: true }));

        expect(result.body.querySelectorAll('img')).toHaveLength(0);
        expect(result.body.querySelectorAll('a')).toHaveLength(0);
        expect(result.body.textContent).toContain('is-badge');
    });

    test('removes the supplied Joplin donation badge block and its empty links', async () => {
        const result = await processHtml(JOPLIN_DONATION_BADGES, pasteOptions({ removeBadges: true }));

        expect(result.body.querySelectorAll('img')).toHaveLength(0);
        expect(result.body.querySelectorAll('a')).toHaveLength(0);
        expect(result.body.textContent).toContain('Creating a table of contents plugin');
        expect(result.body.textContent).toContain('This tutorial will guide you through the steps');
    });

    test('preserves badges when the option is disabled', async () => {
        const result = await processHtml(JOPLIN_DONATION_BADGES, pasteOptions({ removeBadges: false }));

        expect(result.body.querySelectorAll('img')).toHaveLength(4);
        expect(result.body.querySelectorAll('a')).toHaveLength(4);
    });

    test.each([
        'https://img.shields.io/npm/v/example.svg',
        'https://badgen.net/npm/v/example',
        'https://nodei.co/npm/example.png',
        'https://saucelabs.com/buildstatus/owner/repo',
        'https://coveralls.io/repos/github/owner/repo/badge.svg?branch=main',
        'https://codecov.io/gh/owner/repo/branch/main/graph/badge.svg',
        'https://github.com/owner/repo/actions/workflows/test.yml/badge.svg?branch=main',
        'https://opencollective.com/example/sponsors/badge.svg',
        'https://circleci.com/gh/owner/repo.svg?style=shield',
        'https://raw.githubusercontent.com/owner/repo/main/assets/badges/custom-donate.svg',
    ])('recognizes badge image URL %s', (src) => {
        const body = makeBody(`<p><img src="${src}" alt="Project information"></p>`);

        removeBadgeImages(body);

        expect(body.querySelector('img')).toBeNull();
    });

    test.each([
        'https://www.paypal.com/donate/?hosted_button_id=button-id',
        'https://github.com/sponsors/example/',
        'https://www.patreon.com/example',
        'https://joplinapp.org/donate/#donations',
        'https://ko-fi.com/example',
        'https://buymeacoffee.com/example',
    ])('recognizes a custom-hosted donation image through link URL %s', (href) => {
        const body = makeBody(
            `<a href="${href}"><img src="https://cdn.example.com/custom-button.svg" alt="Project"></a>`
        );

        removeBadgeImages(body);

        expect(body.querySelector('img')).toBeNull();
    });

    test('uses donation alt text for an unlinked custom-hosted button', () => {
        const body = makeBody(
            '<img src="https://cdn.example.com/custom-button.svg" alt="Donate using a bank transfer">'
        );

        removeBadgeImages(body);

        expect(body.querySelector('img')).toBeNull();
    });

    test('preserves ordinary images and meaningful text beside a removed badge', async () => {
        const html = `
            <a href="https://www.paypal.com/donate/">
                <img src="https://cdn.example.com/donate.svg" alt="Project">Donation options
            </a>
            <img src="https://example.com/photos/badge-shaped-sign.png" alt="A badge-shaped sign">
        `;
        const result = await processHtml(html, pasteOptions({ removeBadges: true }));

        expect(result.body.querySelectorAll('img')).toHaveLength(1);
        expect(result.body.querySelector('img')?.getAttribute('src')).toBe(
            'https://example.com/photos/badge-shaped-sign.png'
        );
        expect(result.body.querySelector('a')?.textContent?.trim()).toBe('Donation options');
    });

    test('preserves an ordinary image proxied through GitHub Camo', () => {
        const body = makeBody(`
            <img
                src="https://camo.githubusercontent.com/fd62176a5c7543366f5cfb552afa818a644ca3ca2f6174c1885d8fd51b212044/68747470733a2f2f6578616d706c652e636f6d2f70686f746f2e706e67"
                alt="Project screenshot"
            >
        `);

        removeBadgeImages(body);

        expect(body.querySelector('img')).not.toBeNull();
    });

    test('removes a badge picture with its source alternatives', () => {
        const body = makeBody(`
            <picture>
                <source src="https://img.shields.io/npm/v/example.webp">
                <img src="https://img.shields.io/npm/v/example.svg" alt="npm version">
            </picture>
        `);

        removeBadgeImages(body);

        expect(body.querySelector('picture')).toBeNull();
        expect(body.querySelector('source')).toBeNull();
    });

    test('removes badges before resource conversion begins', async () => {
        let sourcesAtConversion: string[] = [];
        vi.spyOn(resourceConverter, 'convertImagesToResources').mockImplementation(async (body) => {
            sourcesAtConversion = Array.from(body.querySelectorAll('img')).map(
                (image) => image.getAttribute('src') || ''
            );
            return { ids: [], attempted: sourcesAtConversion.length, failed: 0 };
        });

        await processHtml(
            `${JOPLIN_DONATION_BADGES}<img src="https://example.com/diagram.png" alt="Diagram">`,
            pasteOptions({ removeBadges: true, convertImagesToResources: true })
        );

        expect(sourcesAtConversion).toEqual(['https://example.com/diagram.png']);
    });
});
