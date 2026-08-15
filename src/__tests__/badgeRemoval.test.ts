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

function makeBody(html: string): HTMLElement {
    return new DOMParser().parseFromString(html, 'text/html').body;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('badge removal', () => {
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
