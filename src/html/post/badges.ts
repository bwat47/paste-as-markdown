import { isInCode } from '../shared/dom';

const BADGE_IMAGE_EXTENSIONS = '(?:svg|png|gif|webp)';

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

function isBadgeImage(image: HTMLImageElement): boolean {
    if (matchesAny(image.getAttribute('src'), BADGE_IMAGE_URL_PATTERNS)) return true;
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
