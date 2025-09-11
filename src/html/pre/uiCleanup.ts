import { isInCode } from '../shared/dom';

// Remove generic UI elements that are noise in Markdown exports.
export function removeNonContentUi(body: HTMLElement): void {
    // 1) Remove <button> elements entirely (skip if inside code/pre examples)
    Array.from(body.querySelectorAll('button')).forEach((btn) => {
        if (!isInCode(btn)) (btn as HTMLElement).remove();
    });

    // 2) Remove common role-based UI controls
    const roles = ['button', 'toolbar', 'tablist', 'tab', 'menu', 'menubar', 'combobox', 'switch'];
    roles.forEach((role) => {
        Array.from(body.querySelectorAll(`[role="${role}"]`)).forEach((el) => {
            if (!isInCode(el)) (el as HTMLElement).remove();
        });
    });

    // 3) Remove non-checkbox inputs (preserve checkboxes for GFM task lists)
    Array.from(body.querySelectorAll('input')).forEach((el) => {
        if (isInCode(el)) return;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type !== 'checkbox') (el as HTMLElement).remove();
    });

    // 4) Remove <select>; keep <textarea> so its text content survives
    Array.from(body.querySelectorAll('select')).forEach((el) => {
        if (!isInCode(el)) (el as HTMLElement).remove();
    });
}
