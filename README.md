> [!important]
> My coding knowledge is currently very limited. This plugin was created entirely with AI tools, and I may be limited in my ability to fix any issues.

# Paste as Markdown

A Joplin plugin that allows you to paste HTML formatted text as markdown in the markdown editor.

The plugin uses Turndown to convert HTML to markdown.

Useful for scenarios where you can't use the joplin web clipper (e.g. copying text from an email client) and/or where you don't want to edit the note with the rich text editor (to avoid changes to existing markdown formatting by the rich text editor).

The plugin prioritizes clean markdown, the only HTML elements that are retained are: `<img>` embeds (only if the image has a specified width/height) and `sup`/`sub`/`ins`. `<br>` tags are removed and excess whitespace is normalized.

![paste-as-markdown](https://github.com/user-attachments/assets/78d2b555-f848-42c0-a30e-e4267a4b1957)

## How to use

In the markdown editor, right click and select "Paste as Markdown" (or use the keyboard shortcut, ctrl + alt +v by default).

If you have HTML formatted text in the clipboard, the plugin will convert it to markdown formatting and paste the markdown formatted text.

If you don't have HTML formatted text in the clipboard, the plugin will fall back to pasting the plain text (if available).

## Features

- **Image Handling** - Keep remote/base64 encoded images as-is, convert images to Joplin resources, or remove images entirely.

- **DOM preprocessing** - Sanitizes HTML with DOMPurify and uses DOM pre-processing to remove unwanted elements before turndown conversion (empty permalink anchors, permalink symbols in headings, bold text inside headings, UI elements, exotic image attributes, etc...).
    - **Code block normalization** - Improved reliability when pasting code blocks. Normalizes known code block wrappers/containers to simple `<code>`/`<pre>` and infers language from common class patterns and applies a normalized class="language-xxx".

    - **Whitspace normalization** - Minimal post-processing to remove leftover `<br>` elements and excess whitespace between paragraphs.

    - **Text normalization** - Normalizes nbsp and zero width space characters to regular spaces. (Optionally) normalizes smart quotes to regular quotes.

    - **List normalization** - Re-nests orphaned lists, so numbering/indentation is properly preserved when pasting nested lists from sources like Outlook/Google Docs/Onenote. Uniform spacing (one space) after list markers.

    - **Image normalization** - HTML `<img>` embeds will only contain a standardized set of attributes: src, alt, title, width, height. Images that are converted to joplin resources will be unwrapped from external anchor links. Promotes inline css width/height to HTML attributes so that image sizes are maintained through turndown conversion.

- **Table support** - HTML tables are converted to markdown tables via turndown-plugin-gfm. Additionally, the plugin wraps orphaned table elements with `<table>` tags, allowing pasted cells from excel/google sheets to be pasted as tables.

## Settings

- **Include Images** - By default, images (external or base64 encoded) are included in the pasted text. If desired, you can un-check include images in the plugin settings so that images are not included in the pasted text.

- **Convert images to Joplin resources** - If enabled (along with Include images), external (http/https) and base64 encoded images will automatically be converted to Joplin resources.

- **Normalize smart quotes** - Convert Word/Office smart quotes to regular quotes for better markdown compatibility.

- **Force tight lists** - Removes space between list items.
