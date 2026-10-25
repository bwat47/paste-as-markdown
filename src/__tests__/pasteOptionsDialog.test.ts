import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import {
    buildPasteOptionsDialogHtml,
    createPasteOptionsDialog,
    parsePasteOptionsFormData,
} from '../dialog/pasteOptionsDialog';
import { LIST_INDENTATION } from '../types';
import { inertPasteOptions, pasteOptions } from './helpers/pasteOptions';
// Registers the webview script's document listeners, as loading it into the dialog would.
import '../dialog/webview/pasteOptionsDialog.js';

vi.mock('api');
vi.mock('../logger', () => ({
    default: {
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

/** Renders the dialog into the document and returns its form, as the Joplin webview would. */
function renderDialog(html: string): HTMLFormElement {
    document.body.innerHTML = html;
    return document.querySelector('form')!;
}

/** Serializes a form the way Joplin's webview does: one entry per `FormData` key, keyed by form name. */
function serializeForm(form: HTMLFormElement): Record<string, Record<string, FormDataEntryValue>> {
    return { [form.getAttribute('name')!]: Object.fromEntries(new FormData(form)) };
}

function checkbox(form: HTMLFormElement, name: string): HTMLInputElement {
    return form.elements.namedItem(name) as HTMLInputElement;
}

function toggle(input: HTMLInputElement): void {
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('paste options dialog form', () => {
    test('pre-fills every option from the given options', () => {
        const options = pasteOptions({
            includeImages: true,
            convertImagesToResources: true,
            normalizeQuotes: false,
            forceTightLists: true,
            listIndentation: LIST_INDENTATION.SPACES,
        });
        const form = renderDialog(buildPasteOptionsDialogHtml(options));

        expect(checkbox(form, 'includeImages').checked).toBe(true);
        expect(checkbox(form, 'convertImagesToResources').checked).toBe(true);
        expect(checkbox(form, 'normalizeQuotes').checked).toBe(false);
        expect(checkbox(form, 'forceTightLists').checked).toBe(true);
        expect((form.elements.namedItem('listIndentation') as HTMLSelectElement).value).toBe(LIST_INDENTATION.SPACES);
    });

    test('round-trips options through the rendered form', () => {
        const options = pasteOptions({ convertImagesToResources: true, forceTightLists: true });
        const form = renderDialog(buildPasteOptionsDialogHtml(options));

        expect(parsePasteOptionsFormData(serializeForm(form), inertPasteOptions())).toEqual(options);
    });

    test('renders the resources option disabled but checked when images are excluded', () => {
        const form = renderDialog(
            buildPasteOptionsDialogHtml(pasteOptions({ includeImages: false, convertImagesToResources: true }))
        );
        const resources = checkbox(form, 'convertImagesToResources');

        expect(resources.disabled).toBe(true);
        expect(resources.checked).toBe(true);
        // Disabled inputs are left out of form data, so the paste does not convert resources.
        expect(parsePasteOptionsFormData(serializeForm(form), pasteOptions())).toMatchObject({
            includeImages: false,
            convertImagesToResources: false,
        });
    });

    test('treats absent checkboxes as unchecked', () => {
        const parsed = parsePasteOptionsFormData(
            { pasteOptions: { listIndentation: LIST_INDENTATION.TABS } },
            pasteOptions({ includeImages: true, normalizeQuotes: true })
        );

        expect(parsed).toEqual(inertPasteOptions({ listIndentation: LIST_INDENTATION.TABS }));
    });

    test('falls back to the default list indentation for unknown values', () => {
        const parsed = parsePasteOptionsFormData(
            { pasteOptions: { listIndentation: 'two-spaces' } },
            pasteOptions({ listIndentation: LIST_INDENTATION.SPACES })
        );

        expect(parsed.listIndentation).toBe(LIST_INDENTATION.SPACES);
    });

    test('uses the defaults when form data is missing', () => {
        const defaults = pasteOptions({ forceTightLists: true });

        expect(parsePasteOptionsFormData(undefined, defaults)).toBe(defaults);
        expect(parsePasteOptionsFormData({}, defaults)).toBe(defaults);
    });
});

describe('paste options dialog webview script', () => {
    test('disables the resources option while images are excluded', () => {
        const form = renderDialog(buildPasteOptionsDialogHtml(pasteOptions({ includeImages: true })));
        const images = checkbox(form, 'includeImages');
        const resources = checkbox(form, 'convertImagesToResources');

        toggle(images);
        expect(resources.disabled).toBe(true);

        toggle(images);
        expect(resources.disabled).toBe(false);
    });

    test('submits the form on Enter so Joplin clicks the Paste button', () => {
        const form = renderDialog(buildPasteOptionsDialogHtml(pasteOptions()));
        const onSubmit = vi.fn<(event: Event) => void>();
        document.addEventListener('submit', onSubmit);

        checkbox(form, 'normalizeQuotes').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        );

        document.removeEventListener('submit', onSubmit);
        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0][0].defaultPrevented).toBe(true);
    });

    test('prevents native form submission', () => {
        const form = renderDialog(buildPasteOptionsDialogHtml(pasteOptions()));
        const event = new Event('submit', { bubbles: true, cancelable: true });

        form.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });
});

describe('createPasteOptionsDialog', () => {
    let dialogs: Record<'create' | 'setButtons' | 'addScript' | 'setHtml' | 'open', Mock>;

    beforeEach(async () => {
        dialogs = {
            create: vi.fn().mockResolvedValue('handle'),
            setButtons: vi.fn().mockResolvedValue([]),
            addScript: vi.fn().mockResolvedValue(undefined),
            setHtml: vi.fn().mockResolvedValue(''),
            open: vi.fn(),
        };
        const joplinModule = await import('api');
        (joplinModule.default as unknown) = { views: { dialogs } };
    });

    test('sets up the dialog once with Enter/Escape-aware buttons and its webview assets', async () => {
        await createPasteOptionsDialog();

        expect(dialogs.create).toHaveBeenCalledOnce();
        expect(dialogs.setButtons).toHaveBeenCalledWith('handle', [
            { id: 'ok', title: 'Paste' },
            { id: 'cancel', title: 'Cancel' },
        ]);
        expect(dialogs.addScript).toHaveBeenCalledWith('handle', './dialog/webview/pasteOptionsDialog.css');
        expect(dialogs.addScript).toHaveBeenCalledWith('handle', './dialog/webview/pasteOptionsDialog.js');
    });

    test('renders the defaults and returns the submitted options', async () => {
        const defaults = pasteOptions();
        dialogs.open.mockResolvedValue({
            id: 'ok',
            formData: { pasteOptions: { normalizeQuotes: 'on', listIndentation: LIST_INDENTATION.SPACES } },
        });

        const prompt = await createPasteOptionsDialog();
        const result = await prompt(defaults);

        expect(dialogs.setHtml).toHaveBeenCalledWith('handle', buildPasteOptionsDialogHtml(defaults));
        expect(result).toEqual(inertPasteOptions({ normalizeQuotes: true }));
    });

    test('returns null when the dialog is cancelled', async () => {
        dialogs.open.mockResolvedValue({ id: 'cancel' });

        const prompt = await createPasteOptionsDialog();

        await expect(prompt(pasteOptions())).resolves.toBeNull();
    });

    test('skips an overlapping prompt without opening the dialog twice', async () => {
        let closeDialog: (result: unknown) => void = () => {};
        dialogs.open.mockReturnValueOnce(new Promise((resolve) => (closeDialog = resolve)));

        const prompt = await createPasteOptionsDialog();
        const first = prompt(pasteOptions());

        await expect(prompt(pasteOptions())).resolves.toBeNull();
        closeDialog({ id: 'cancel' });
        await first;
        expect(dialogs.open).toHaveBeenCalledOnce();
    });

    test('allows the dialog to open again after it closes', async () => {
        dialogs.open.mockResolvedValue({ id: 'cancel' });

        const prompt = await createPasteOptionsDialog();
        await prompt(pasteOptions());
        await prompt(pasteOptions());

        expect(dialogs.open).toHaveBeenCalledTimes(2);
    });
});
