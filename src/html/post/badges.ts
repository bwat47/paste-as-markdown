import { isInCode } from '../shared/dom';

/**
 * Badge assets are effectively always SVG, so the generic `/badges/` path rule is limited to that
 * extension. Raster formats under such a path are far more likely to be photographs.
 */
const BADGE_ASSET_EXTENSION = 'svg';
/** Status and donation badges render at roughly 20 CSS pixels tall; taller images are content. */
const MAX_BADGE_ASSET_HEIGHT = 40;
const MAX_CAMO_ENCODED_URL_LENGTH = 16 * 1024;
const HEX_PAIR_LENGTH = 2;
const GITHUB_CAMO_URL_PATTERN = /^https?:\/\/camo\.githubusercontent\.com\/[0-9a-f]+\/([0-9a-f]+)(?:[?#]|$)/i;
/** Scheme assumed for protocol-relative URLs (`//img.shields.io/...`) so patterns can require one. */
const PROTOCOL_RELATIVE_URL_PATTERN = /^\/\//;
const ASSUMED_URL_SCHEME = 'https:';

/**
 * Known badge service and badge-asset URL shapes.
 *
 * Examples:
 * - https://img.shields.io/npm/v/example.svg
 * - https://github.com/owner/repo/actions/workflows/test.yml/badge.svg
 * - https://raw.githubusercontent.com/owner/repo/main/assets/badges/Donate-PayPal-green.svg
 *
 * Patterns adapted from https://github.com/wooorm/is-badge
 * Copyright (c) 2015 Titus Wormer <mailto:tituswormer@gmail.com>
 * Licensed under the MIT License
 */
const BADGE_IMAGE_URL_PATTERNS: readonly RegExp[] = [
    /^https?:\/\/img\.shields\.io(?:\/|$)/i,
    /^https?:\/\/badgen\.net(?:\/|$)/i,
    // Hosts that exist to serve badges: badge.fury.io, badges.gitter.im, badge.socket.dev, ...
    /^https?:\/\/badges?\.[^/?#]+(?:\/|$)/i,
    /^https?:\/\/(?:www\.)?travis-ci\.(?:com|org)\/.*\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/(?:www\.)?nodei\.co(?:\/[^/?#]+){2}\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/inch-ci\.org(?:\/[^/?#]+){3}\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/ci\.testling\.com(?:\/[^/?#]+){2}\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/saucelabs\.com\/(?:buildstatus|browser-matrix)\//i,
    /^https?:\/\/(?:www\.)?coveralls\.io\/.*\/badge\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/(?:www\.)?codecov\.io\/.*\/badge\.svg(?:[?#]|$)/i,
    /^https?:\/\/codeclimate\.com\/github\/.*\/(?:badges\/[^/?#]+|maintainability|test_coverage)\.(?:svg|png)(?:[?#]|$)/i,
    /^https?:\/\/(?:www\.)?github\.com\/[^/?#]+\/[^/?#]+\/(?:actions\/)?workflows\/[^/?#]+\/badge\.svg(?:[?#]|$)/i,
    /^https?:\/\/(?:www\.)?opencollective\.com\/[^/?#]+\/(?:sponsors|backers)\/badge\.svg(?:[?#]|$)/i,
    /^https?:\/\/issuestats\.com\/github(?:\/[^/?#]+){2}\/badge\/(?:pr|issue)\/?(?:[?#]|$)/i,
    /^https?:\/\/(?:www\.)?circleci\.com\/(?:gh|bb)(?:\/[^/?#]+){2}\.(?:svg|png)(?:[?#]|$)/i,
    new RegExp(`^https?:\\/\\/[^/?#]+\\/(?:[^?#]*\\/)?badges?\\/[^?#]+\\.${BADGE_ASSET_EXTENSION}(?:[?#]|$)`, 'i'),
];

/** Path segment that marks a badge endpoint, as in `/projects/12162/badge` or `/badge/owner/repo`. */
const BADGE_PATH_SEGMENT_PATTERN = /^badges?$/i;
/** A final segment carrying a file extension is a stored asset, covered by the patterns above. */
const FILE_EXTENSION_PATTERN = /\.[a-z0-9]{2,5}$/i;
const URL_ORIGIN_PATTERN = /^https?:\/\/[^/?#]+/i;

/**
 * Donation destinations identify custom-hosted buttons whose image URL alone is generic.
 * The final pattern covers project-owned donation pages such as https://joplinapp.org/donate/.
 */
const DONATION_LINK_URL_PATTERNS: readonly RegExp[] = [
    /^https?:\/\/(?:www\.)?paypal\.com\/donate(?:[/?#]|$)/i,
    /^https?:\/\/(?:www\.)?paypal\.me(?:[/?#]|$)/i,
    /^https?:\/\/(?:www\.)?github\.com\/sponsors(?:[/?#]|$)/i,
    /^https?:\/\/(?:www\.)?patreon\.com(?:[/?#]|$)/i,
    /^https?:\/\/(?:www\.)?(?:ko-fi|buymeacoffee|liberapay|opencollective)\.com(?:[/?#]|$)/i,
    /^https?:\/\/[^/?#]+\/(?:donate|donations|sponsor|sponsors)(?:[/?#]|$)/i,
];

/**
 * Accessible labels used by common donation buttons, including custom-hosted images.
 *
 * These are call-to-action phrases rather than bare nouns such as "donate" or "paypal", because an
 * alt attribute is matched on its own: a screenshot labelled "PayPal checkout screen" or a photo
 * labelled "Blood donation drive" is ordinary content and must survive the pass.
 */
const DONATION_ALT_PATTERNS: readonly RegExp[] = [
    /\bdonate\s+(?:using|with|via|through|to)\b/i,
    /\bbecome\s+a\s+(?:patron|sponsor|backer)\b/i,
    /\bbuy\s+me\s+a\s+(?:coffee|beer)\b/i,
    /\bsponsor\s+(?:me|us|on|this)\b/i,
    /\bsupport\s+(?:me|us|this\s+project)\b/i,
    /\b(?:donate|donation|sponsor)s?\s+button\b/i,
    /\bko-?fi\b/i,
];

/**
 * Filename hints that corroborate a donation link. Word boundaries are spelled out because
 * separators such as `_` count as word characters (for example `btn_donate_LG.gif`).
 */
const BADGE_FILENAME_HINT_PATTERN =
    /(?:^|[^a-z0-9])(?:badges?|buttons?|donate|donation|sponsor|patreon|kofi|paypal)(?:[^a-z0-9]|$)/i;

function matchesAny(value: string | null, patterns: readonly RegExp[]): boolean {
    if (!value) return false;
    const normalized = value.trim();
    return normalized.length > 0 && patterns.some((pattern) => pattern.test(normalized));
}

/**
 * Trim a URL attribute and give a protocol-relative URL an explicit scheme, so every URL pattern
 * can anchor on `https?://` instead of spelling out the optional-scheme case.
 */
function normalizeUrl(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return PROTOCOL_RELATIVE_URL_PATTERN.test(trimmed) ? `${ASSUMED_URL_SCHEME}${trimmed}` : trimmed;
}

function matchesAnyUrl(value: string | null, patterns: readonly RegExp[]): boolean {
    return matchesAny(normalizeUrl(value), patterns);
}

/**
 * Recover the canonical image URL embedded as hexadecimal bytes in a GitHub Camo URL.
 *
 * Example: `/hash/68747470733a2f2f696d672e736869656c64732e696f...` decodes to an
 * `https://img.shields.io/...` URL. Decoding is bounded because clipboard HTML is untrusted.
 */
function decodeGithubCamoUrl(value: string | null): string | null {
    const match = normalizeUrl(value)?.match(GITHUB_CAMO_URL_PATTERN);
    const encodedUrl = match?.[1];
    if (!encodedUrl || encodedUrl.length % HEX_PAIR_LENGTH !== 0 || encodedUrl.length > MAX_CAMO_ENCODED_URL_LENGTH) {
        return null;
    }

    let decodedUrl = '';
    for (let index = 0; index < encodedUrl.length; index += HEX_PAIR_LENGTH) {
        decodedUrl += String.fromCharCode(Number.parseInt(encodedUrl.slice(index, index + HEX_PAIR_LENGTH), 16));
    }
    return decodedUrl;
}

/** The path of a URL, with any query string and fragment removed. */
function getUrlPath(url: string): string {
    return url.split(/[?#]/)[0];
}

/**
 * Whether a URL addresses a badge endpoint rather than a stored image, as in
 * `https://www.bestpractices.dev/projects/12162/badge` or `https://app.cloudback.it/badge/owner/repo`.
 *
 * These services generate an image on request, so the URL carries no file extension. The extension
 * check is what keeps a stored image such as `/photos/badges/police-badge.png` out: an extensionless
 * path with a `badge` segment is an endpoint, never a photograph.
 */
function isBadgeEndpointUrl(url: string): boolean {
    const segments = getUrlPath(url)
        .replace(URL_ORIGIN_PATTERN, '')
        .split('/')
        .filter((segment) => segment.length > 0);
    if (segments.length === 0 || FILE_EXTENSION_PATTERN.test(segments[segments.length - 1])) return false;
    return segments.some((segment) => BADGE_PATH_SEGMENT_PATTERN.test(segment));
}

function isKnownBadgeImageUrl(value: string | null): boolean {
    const candidates = [normalizeUrl(value), decodeGithubCamoUrl(value)];
    return candidates.some(
        (candidate) =>
            candidate !== null && (matchesAny(candidate, BADGE_IMAGE_URL_PATTERNS) || isBadgeEndpointUrl(candidate))
    );
}

function hasBadgeSizedHeight(image: HTMLImageElement): boolean {
    const height = Number.parseInt(image.getAttribute('height') || '', 10);
    return Number.isFinite(height) && height > 0 && height <= MAX_BADGE_ASSET_HEIGHT;
}

/**
 * Whether the image itself looks like a badge asset: an SVG, a badge-like filename, or an image
 * declared at badge height. Used to corroborate a donation link, which describes where the image
 * points rather than what the image is.
 */
function looksLikeBadgeAsset(image: HTMLImageElement): boolean {
    const src = normalizeUrl(image.getAttribute('src'));
    if (src) {
        const path = getUrlPath(src).toLowerCase();
        if (path.endsWith(`.${BADGE_ASSET_EXTENSION}`)) return true;
        if (BADGE_FILENAME_HINT_PATTERN.test(path.slice(path.lastIndexOf('/') + 1))) return true;
    }
    return hasBadgeSizedHeight(image);
}

function isBadgeImage(image: HTMLImageElement): boolean {
    // A known badge-service URL identifies a badge on its own.
    if (isKnownBadgeImageUrl(image.getAttribute('src'))) return true;
    // A donation call-to-action label describes the image itself, so it also stands alone.
    if (matchesAny(image.getAttribute('alt'), DONATION_ALT_PATTERNS)) return true;

    // A donation link only says where the image points, so it needs corroboration from the asset.
    // Without it, a photograph linked from a project's sponsors page would be dropped as a badge.
    const anchor = image.closest('a[href]');
    return (
        matchesAnyUrl(anchor?.getAttribute('href') || null, DONATION_LINK_URL_PATTERNS) && looksLikeBadgeAsset(image)
    );
}

/**
 * Remove known status and donation badge images from sanitized HTML.
 *
 * A surrounding picture is removed with its image so source alternatives do not remain behind.
 * The following empty-anchor pass removes links that contained only the deleted badge while
 * preserving anchors that still have meaningful text or other media.
 */
export function removeBadgeImages(body: HTMLElement): void {
    const images = Array.from(body.querySelectorAll('img[src]')) as HTMLImageElement[];

    images.forEach((image) => {
        if (!body.contains(image) || isInCode(image) || !isBadgeImage(image)) return;

        const picture = image.closest('picture');
        if (picture && body.contains(picture)) {
            picture.remove();
        } else {
            image.remove();
        }
    });
}
