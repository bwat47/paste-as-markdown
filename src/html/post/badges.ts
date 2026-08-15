import { isInCode } from '../shared/dom';

const BADGE_IMAGE_EXTENSIONS = '(?:svg|png|gif|webp)';
const MAX_CAMO_ENCODED_URL_LENGTH = 16 * 1024;
const HEX_PAIR_LENGTH = 2;
const GITHUB_CAMO_URL_PATTERN = /^https?:\/\/camo\.githubusercontent\.com\/[0-9a-f]+\/([0-9a-f]+)(?:[?#]|$)/i;

/**
 * Known badge service and badge-asset URL shapes.
 *
 * Examples:
 * - https://img.shields.io/npm/v/example.svg
 * - https://github.com/owner/repo/actions/workflows/test.yml/badge.svg
 * - https://raw.githubusercontent.com/owner/repo/main/assets/badges/Donate-PayPal-green.svg
 */
const BADGE_IMAGE_URL_PATTERNS: readonly RegExp[] = [
    /^https?:\/\/img\.shields\.io(?:\/|$)/i,
    /^https?:\/\/(?:badgen\.net|badge\.fury\.io|badges\.gitter\.im)(?:\/|$)/i,
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
    new RegExp(`^https?:\\/\\/[^/?#]+\\/(?:[^?#]*\\/)?badges?\\/[^?#]+\\.${BADGE_IMAGE_EXTENSIONS}(?:[?#]|$)`, 'i'),
];

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

/** Accessible labels used by common donation buttons, including custom-hosted images. */
const DONATION_ALT_PATTERN =
    /\b(?:donat(?:e|ion)|sponsor(?:ship)?|become a patron|buy me a coffee|ko-fi|patreon|paypal)\b/i;

function matchesAny(value: string | null, patterns: readonly RegExp[]): boolean {
    if (!value) return false;
    const normalized = value.trim();
    return normalized.length > 0 && patterns.some((pattern) => pattern.test(normalized));
}

/**
 * Recover the canonical image URL embedded as hexadecimal bytes in a GitHub Camo URL.
 *
 * Example: `/hash/68747470733a2f2f696d672e736869656c64732e696f...` decodes to an
 * `https://img.shields.io/...` URL. Decoding is bounded because clipboard HTML is untrusted.
 */
function decodeGithubCamoUrl(value: string | null): string | null {
    if (!value) return null;
    const match = value.trim().match(GITHUB_CAMO_URL_PATTERN);
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

function isKnownBadgeImageUrl(value: string | null): boolean {
    if (matchesAny(value, BADGE_IMAGE_URL_PATTERNS)) return true;
    return matchesAny(decodeGithubCamoUrl(value), BADGE_IMAGE_URL_PATTERNS);
}

function isBadgeImage(image: HTMLImageElement): boolean {
    if (isKnownBadgeImageUrl(image.getAttribute('src'))) return true;
    if (DONATION_ALT_PATTERN.test(image.getAttribute('alt')?.trim() || '')) return true;

    const anchor = image.closest('a[href]');
    return matchesAny(anchor?.getAttribute('href') || null, DONATION_LINK_URL_PATTERNS);
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
