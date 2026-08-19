# Paste HTML as Markdown

Paste content from websites, email, Office, Google Docs, and spreadsheets into Joplin as clean, editable Markdown. The plugin sanitizes copied HTML, removes webpage clutter, and repairs common problems with lists, tables, code blocks, links, and images before conversion.

This is useful when the Web Clipper is not available, such as when copying from an email client, or when you want to paste formatted content without opening Joplin's rich text editor and risking changes to the rest of the note.

## Why use this instead of Joplin's built-in command?

This plugin was originally created when Joplin's markdown editor lacked a Paste as Markdown command (and the only options were using the web clipper or rich text editor).

Joplin 3.6 introduced a built-in Paste as Markdown command. This plugin remains useful when the clipboard HTML needs more cleanup than the built-in conversion provides (e.g. pasting complex content from browsers, email, Office, Google Docs, spreadsheets and/or if you just want cleaner/more predictable Markdown output).

_examples comparing built-in paste as markdown feature with the plugin_

![Comparison showing image handling and code-block language detection](https://github.com/bwat47/paste-as-markdown/blob/main/images/paste-html-as-md-examples.gif)

![Comparison showing table conversion](https://github.com/bwat47/paste-as-markdown/blob/main/images/table-conversion-examples.gif)

## Highlights

- Sanitizes clipboard HTML with DOMPurify and removes copied buttons, toolbars, form controls, permalink anchors, and other interface clutter.
- Repairs malformed lists, preserves numbering and nesting, and converts HTML checkboxes to GFM task lists.
- Normalizes headings, links, whitespace, and document-editor markup without altering fenced code blocks.
- Converts HTML tables and partial spreadsheet selections to Markdown tables while preserving line breaks inside cells.
- Produces clean fenced code blocks from common code hosts and editors, removing line numbers and detecting common language aliases.
- Recovers images from `srcset` and `<picture>` elements, preserves supported dimensions, and supplies readable alternative text when needed.
- Uses Joplin-friendly Markdown conventions, including ATX headings, GFM tables and task lists, and `==highlight==` syntax.
- Protects literal HTML examples in prose and code while removing unsafe live HTML.

## How to use

In the Markdown editor, right-click and select **Paste HTML as Markdown**, or use <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> (the default shortcut).

If the clipboard contains HTML, the plugin cleans it, converts it to Markdown, and inserts the result at the cursor. If the clipboard contains only plain text, that text is pasted unchanged.

## Settings

- **Include images** — Keep images in the pasted content. Enabled by default; disable it to remove images entirely.
- **Convert images to Joplin resources** — Store HTTP(S) and base64-encoded images as Joplin-managed resources. Requires **Include images**.
- **Normalize smart quotes** — Convert Word and Office smart quotes to plain quotes for better Markdown compatibility. Enabled by default.
- **Force tight lists** — Remove blank lines between ordinary list items while retaining the spacing required by multi-block items.
- **List indentation** — Indent nested list items and continuation lines with tabs or spaces. Tabs are used by default to match the default behavior of Joplin's Markdown editor.

## Output format

The plugin favors portable Markdown. It retains inline HTML only when needed for explicitly sized images, superscript (`<sup>`), subscript (`<sub>`), inserted text (`<ins>`), or intentional `<br>` elements whose replacement would break a table cell or inline-code structure.

## Development note

This plugin was created entirely with AI tools.
