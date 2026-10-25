import joplin from 'api';
import logger from '../logger';
import { LIST_INDENTATION_LABELS, PASTE_OPTION_LABELS, SETTINGS } from '../settings';
import { LIST_INDENTATION, type ListIndentation, type PasteOptions, type PasteOptionsPrompt } from '../types';

const DIALOG_ID = 'pasteOptionsDialog';
const DIALOG_SCRIPT = './dialog/webview/pasteOptionsDialog.js';
const DIALOG_STYLESHEET = './dialog/webview/pasteOptionsDialog.css';
const FORM_NAME = 'pasteOptions';

// Joplin clicks the first "ok" button on Enter and the first "cancel" button on Escape.
const BUTTON_IDS = {
    PASTE: 'ok',
    CANCEL: 'cancel',
} as const;

const BOOLEAN_OPTIONS = [
    SETTINGS.INCLUDE_IMAGES,
    SETTINGS.CONVERT_IMAGES_TO_RESOURCES,
    SETTINGS.NORMALIZE_QUOTES,
    SETTINGS.FORCE_TIGHT_LISTS,
] as const;

type BooleanOption = (typeof BOOLEAN_OPTIONS)[number];

/** Checkboxes that only apply while another checkbox is checked; the webview script disables them otherwise. */
const OPTION_DEPENDENCIES: Partial<Record<BooleanOption, BooleanOption>> = {
    [SETTINGS.CONVERT_IMAGES_TO_RESOURCES]: SETTINGS.INCLUDE_IMAGES,
};

function renderCheckbox(name: BooleanOption, options: PasteOptions): string {
    const requires = OPTION_DEPENDENCIES[name];
    const attributes = [
        `type="checkbox"`,
        `name="${name}"`,
        options[name] ? 'checked' : '',
        requires ? `data-requires="${requires}"` : '',
        requires && !options[requires] ? 'disabled' : '',
    ].filter(Boolean);
    const optionClass = requires ? 'option option-dependent' : 'option';
    return `<label class="${optionClass}"><input ${attributes.join(' ')}> ${PASTE_OPTION_LABELS[name]}</label>`;
}

function renderListIndentationSelect(options: PasteOptions): string {
    const choices = Object.entries(LIST_INDENTATION_LABELS)
        .map(([value, label]) => {
            const selected = value === options.listIndentation ? ' selected' : '';
            return `<option value="${value}"${selected}>${label}</option>`;
        })
        .join('');
    return (
        `<label class="option option-select">${PASTE_OPTION_LABELS.listIndentation} ` +
        `<select name="${SETTINGS.LIST_INDENTATION}">${choices}</select></label>`
    );
}

/** Builds the dialog form, pre-filled from the given options. All interpolated values are static constants. */
export function buildPasteOptionsDialogHtml(options: PasteOptions): string {
    const checkboxes = BOOLEAN_OPTIONS.map((name) => renderCheckbox(name, options)).join('');
    return (
        // tabindex lets the webview script focus the form, so key events reach the dialog when it opens.
        `<form name="${FORM_NAME}" class="paste-options" tabindex="-1">` +
        `<h3>Paste options</h3>` +
        checkboxes +
        renderListIndentationSelect(options) +
        `</form>`
    );
}

function isListIndentation(value: unknown): value is ListIndentation {
    return value === LIST_INDENTATION.SPACES || value === LIST_INDENTATION.TABS;
}

/**
 * Converts the dialog's form data back into paste options.
 *
 * Browsers omit unchecked and disabled checkboxes from form data, so an absent checkbox means `false`.
 * If the form data is missing entirely, the defaults are used unchanged.
 */
export function parsePasteOptionsFormData(formData: unknown, defaults: PasteOptions): PasteOptions {
    const form = (formData as Record<string, unknown> | undefined)?.[FORM_NAME];
    if (!form || typeof form !== 'object') {
        logger.warn('Paste options dialog returned no form data; using saved settings');
        return defaults;
    }

    const fields = form as Record<string, unknown>;
    const listIndentation = fields[SETTINGS.LIST_INDENTATION];
    return {
        includeImages: SETTINGS.INCLUDE_IMAGES in fields,
        convertImagesToResources: SETTINGS.CONVERT_IMAGES_TO_RESOURCES in fields,
        normalizeQuotes: SETTINGS.NORMALIZE_QUOTES in fields,
        forceTightLists: SETTINGS.FORCE_TIGHT_LISTS in fields,
        listIndentation: isListIndentation(listIndentation) ? listIndentation : defaults.listIndentation,
    };
}

/**
 * Creates the per-paste options dialog and returns a prompt that opens it.
 * Must be called once, during plugin startup.
 */
export async function createPasteOptionsDialog(): Promise<PasteOptionsPrompt> {
    const dialogs = joplin.views.dialogs;
    const handle = await dialogs.create(DIALOG_ID);
    await dialogs.setButtons(handle, [
        { id: BUTTON_IDS.PASTE, title: 'Paste' },
        { id: BUTTON_IDS.CANCEL, title: 'Cancel' },
    ]);
    await dialogs.addScript(handle, DIALOG_STYLESHEET);
    await dialogs.addScript(handle, DIALOG_SCRIPT);

    let isOpen = false;
    return async (defaults) => {
        // Opening the dialog again while it's open makes Joplin show an error, so an overlapping
        // paste is skipped. Set before the first await so no second call can slip through.
        if (isOpen) {
            logger.debug('Paste options dialog is already open; skipping this paste');
            return null;
        }
        isOpen = true;

        try {
            await dialogs.setHtml(handle, buildPasteOptionsDialogHtml(defaults));
            const result = await dialogs.open(handle);
            if (result.id !== BUTTON_IDS.PASTE) return null;
            return parsePasteOptionsFormData(result.formData, defaults);
        } finally {
            isOpen = false;
        }
    };
}
