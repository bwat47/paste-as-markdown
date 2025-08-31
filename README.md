> [!important]
> My coding knowledge is currently very limited. This plugin was created entirely with AI tools, and I may be limited in my ability to fix any issues.

# Paste as Markdown

A Joplin plugin that allows you to paste HTML formatted text as markdown in the markdown editor.

The plugin uses Joplin's modified version of Turndown to convert HTML to markdown, so the results should be very similar to what you get when pasting HTML formatted text inside Joplin's rich text editor.

## How to use

In the markdown editor, right click and select "Paste as Markdown" (or use the keyboard shortcut, ctrl + alt +v by default).

If you have HTML formatted text in the clipbard, the plugin will convert it to markdown formatting and paste the markdown formatted text.

If you don't have HTML formatted text in the clipboard, the plugin will fall back to pasting the plain text.

## Settings

Include Images - By default, images (external or base64 encoded) are included in the pasted text (same behavior as the rich text editor). If desired, you can un-check include images in the plugin settings so that images are not included in the pasted text.
