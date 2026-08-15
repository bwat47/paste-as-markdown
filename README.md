# Paste HTML as Markdown

Paste content from websites, email, Office, Google Docs, and spreadsheets into Joplin as clean, editable Markdown. The plugin sanitizes copied HTML, removes webpage clutter, and repairs common problems with lists, tables, code blocks, links, and images before conversion.

This is useful when the Web Clipper is not available, such as when copying from an email client, or when you want to paste formatted content without opening Joplin's rich text editor and risking changes to the rest of the note.

![Paste HTML as Markdown demonstration](https://github.com/user-attachments/assets/78d2b555-f848-42c0-a30e-e4267a4b1957)

## Why use this instead of Joplin's built-in command?

This plugin was originally created when Joplin's markdown editor lacked a Paste as Markdown command (and the only options were using the web clipper or rich text editor).

Joplin 3.6 introduced a built-in Paste as Markdown command. This plugin remains useful when the clipboard HTML needs more cleanup than the built-in conversion provides (e.g. pasting complex content from browsers, email, Office, Google Docs, spreadsheets and/or if you just want cleaner/more predictable Markdown output).

In addition to converting HTML to markdown with Turndown and a customized turndown-gfm plugin, it applies an opinionated cleanup pipeline designed for pasted fragments: sanitizes HTML down to a limited set of tags/attributes relevant to markdown conversion, repairs malformed structures, removes copied interface elements, handles images in several ways to ensure cleaner/more reliable conversion, and avoids messy output such as stray `<br>` tags, `&nbsp` characters, or tables being retained as raw HTML.

## Features

### Clean, safe Markdown

- Sanitizes clipboard HTML with DOMPurify before converting it.
- Removes copied interface elements such as buttons, toolbars, menus, form controls, and permalink anchors while preserving meaningful content.
- Removes zero-width characters, replaces thin spaces, and optionally converts smart quotes to plain quotes.
- Normalizes excessive whitespace without changing the contents of fenced code blocks.
- Protects literal HTML tag mentions in prose so text such as `<table>` remains cleanly visible (as markdown inline code) instead of being interpreted as markup or displaying unsightly html entity codes.
- Falls back to pasting plain text when HTML is unavailable or cannot be processed safely.

### Better structure from messy sources

- Repairs malformed and orphaned lists commonly copied from Outlook, Google Docs, OneNote, and other rich text editors.
- Preserves ordered-list numbering and nested-list indentation.
- Converts HTML checkboxes to GFM task lists.
- Optionally produces tight lists while preserving spacing inside genuinely multi-block list items.
- Normalizes heading text and prevents heading levels from jumping more than one level deeper at a time.
- Cleans up links that wrap headings or block content and removes decorative permalink links.
- Removes Google Docs wrapper markup that can otherwise place stray asterisks above/below the pasted content.

### Tables and spreadsheets

- Consistently converts HTML tables to Markdown tables instead of leaving certain tables as raw HTML.
- Repairs orphaned table elements, allowing copied cells from Excel and Google Sheets to paste as tables without an empty header row.
- Preserves line breaks inside table cells without splitting Markdown rows.

### Code blocks

- Converts common code containers from GitHub, GitLab, Bitbucket, CodeMirror, and other sites into fenced code blocks.
- Removes copy buttons, toolbars, line-number artifacts, and syntax-highlighting spans from copied code.
- Detects code language names from common class patterns and normalizes aliases such as `js` to `javascript`, `py` to `python`, and `sh` to `bash`.
- Preserves literal HTML examples inside code blocks while unsafe live HTML is sanitized.

### Flexible image handling

- Keep remote and base64-encoded images, convert them to Joplin resources, or remove them entirely.
- Preserves image dimensions by promoting supported inline width and height styles to HTML attributes.
- Recovers images that rely on `srcset` or `<picture>` sources when no ordinary `src` is present.
- Normalizes image alternative text and generates a readable fallback when it is missing.
- Removes external link wrappers from images converted to Joplin resources, ensuring that converted images always render properly in the markdown editor.

### Joplin-friendly output

- Uses ATX headings, fenced code blocks, inline links, and consistent list marker spacing and indentation.
- Supports GFM tables and task lists.
- Converts `<mark>` to Joplin highlight syntax (`==highlight==`).
- Preserves superscript, subscript, inserted text, and explicitly sized images as inline HTML where the markdown syntax is more obscure/less portable than inline HTML.

## How to use

In the Markdown editor, right-click and select **Paste HTML as Markdown**, or use <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> (the default shortcut).

If the clipboard contains HTML, the plugin cleans it, converts it to Markdown, and inserts the result at the cursor. If the clipboard contains only plain text, that text is pasted unchanged.

## Settings

- **Include images** — Keep images in the pasted content. Enabled by default; disable it to remove images entirely.
- **Convert images to Joplin resources** — Store HTTP(S) and base64-encoded images as Joplin-managed resources. Requires **Include images**.
- **Normalize smart quotes** — Convert Word and Office smart quotes to plain quotes for better Markdown compatibility. Enabled by default.
- **Force tight lists** — Remove blank lines between ordinary list items while retaining the spacing required by multi-block items.

## Output philosophy

The plugin favors portable Markdown over inline HTML when practical. Raw HTML is retained only when Markdown cannot represent the same result cleanly or when the markdown syntax is obscure: explicitly sized images, superscript (`<sup>`), subscript (`<sub>`), and inserted text (`<ins>`). Intentional `<br>` elements are also retained inside table cells and inline code where replacing them with newlines would break the structure.

## Development note

This plugin was created entirely with AI tools.
