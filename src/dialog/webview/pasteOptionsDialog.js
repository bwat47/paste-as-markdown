// Runs inside the paste options dialog webview. The plugin replaces the dialog HTML before each
// paste, so listeners are delegated from `document` instead of bound to individual inputs.

/** Disables each `[data-requires="<name>"]` checkbox while the checkbox it depends on is unchecked. */
function syncDependentOptions(form) {
    for (const dependent of form.querySelectorAll('input[data-requires]')) {
        const required = form.elements.namedItem(dependent.dataset.requires);
        dependent.disabled = !required?.checked;
    }
}

document.addEventListener('change', (event) => {
    const form = event.target.closest?.('form');
    if (form) syncDependentOptions(form);
});

// Joplin treats a `submit` event as clicking the dialog's "ok" button. Its own Enter handling only
// covers text inputs, which this dialog has none of, so Enter anywhere in the dialog submits the form.
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    const form = document.querySelector('form');
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
});

// Joplin collects form values itself; letting the native submit through would reload the webview.
document.addEventListener('submit', (event) => event.preventDefault());

// With Joplin's plugin webview isolation enabled, key events only reach this page while focus is
// inside it, and Joplin doesn't move focus here itself. Joplin applies the dialog HTML before loading
// this script on each open, so the form is already present. Focusing the form rather than a checkbox
// avoids drawing a focus ring on an option the user hasn't navigated to.
document.querySelector('form')?.focus();
