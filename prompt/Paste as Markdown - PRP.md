# Paste as Markdown Plugin - Project Requirements and Plan (PRP)

## Project Overview

**Plugin Name**: Paste as Markdown
**Purpose**: Convert HTML clipboard content to markdown and insert it at cursor position
**Target**: Joplin plugin compatible with existing Copy as HTML plugin architecture

## Requirements

### Functional Requirements

#### Core Features

1. **HTML to Markdown Conversion**
    - Read HTML content from system clipboard
    - Convert to markdown using Turndown library
    - Insert converted markdown at current cursor position
    - Handle graceful fallback for plain text clipboard content
2. **Context Menu Integration**
    - "Paste as Markdown" option in context menu
    - Only visible in markdown editor (not rich text editor)
    - Consistent with existing Copy as HTML plugin patterns
3. **Keyboard Shortcut**
    - Default: `Ctrl+Alt+V`
    - Registered in Edit menu as fallback
4. **Table Support**
    - Convert HTML tables to GitHub Flavored Markdown tables
    - Preserve table structure and content
    - Handle basic formatting within table cells

#### User Experience

- Toast notifications for feedback (success, error, info)
- Graceful handling of empty/invalid clipboard content
- Clear error messages for unsupported scenarios
- No UI disruption when clipboard contains non-HTML content

### Technical Requirements

#### Dependencies

- **turndown**: ^7.1.2 (HTML to markdown conversion)
- **turndown-plugin-gfm**: ^1.0.2 (GitHub Flavored Markdown tables)
- Follow existing plugin's dependency management patterns

#### Architecture Constraints

- Follow established plugin patterns from Copy as HTML
- Use TypeScript with same conventions
- Implement same error handling and validation patterns
- Share utility functions where appropriate

#### Performance Requirements

- Process clipboard content synchronously for responsive UX
- Handle large HTML documents without blocking UI
- Minimal memory footprint during conversion

## Technical Design

### Project Structure

```
paste-as-markdown/
├─ src/
│  ├─ index.ts              # Plugin registration, commands, context menu
│  ├─ constants.ts          # Settings keys, default options
│  ├─ types.ts             # TypeScript interfaces
│  ├─ utils.ts             # Validation and utility functions
│  ├─ markdownConverter.ts  # Turndown service configuration
│  └─ pasteHandler.ts      # Clipboard operations and insertion
├─ dist/                   # Build output
├─ manifest.json          # Plugin metadata
├─ package.json           # Dependencies and build scripts
└─ README.md              # Documentation
```

### Core Components

#### 1. Command Registration (`index.ts`)

```typescript
await joplin.commands.register({
    name: 'pasteAsMarkdown',
    label: 'Paste as Markdown',
    iconName: 'fas fa-paste',
    execute: async () => {
        // Main paste logic
    },
});
```

#### 2. Markdown Converter (`markdownConverter.ts`)

````typescript
export function createTurndownService(): TurndownService {
    const turndownService = new TurndownService({
        headingStyle: 'atx', // # Heading
        codeBlockStyle: 'fenced', // ``` blocks
        bulletListMarker: '-', // - item
        emDelimiter: '*', // *italic*
        strongDelimiter: '**', // **bold**
    });

    // Add GFM table support
    turndownService.use(gfm);

    return turndownService;
}
````

#### 3. Paste Handler (`pasteHandler.ts`)

```typescript
export async function handlePasteAsMarkdown(): Promise<void> {
    const html = await joplin.clipboard.readHtml();
    if (!html) {
        throw new Error('No HTML content in clipboard');
    }

    const markdown = convertHtmlToMarkdown(html);
    await insertMarkdownAtCursor(markdown);
}
```

#### 4. Context Menu Filter

- Reuse pattern from Copy as HTML plugin
- Detect markdown editor using `getCursor` command
- Dynamically add menu item only in markdown editor context

### Error Handling Strategy

1. **Clipboard Validation**
    - Check for HTML content availability
    - Provide informative messages for empty clipboard
    - Handle clipboard access permissions gracefully
2. **Conversion Errors**
    - Catch Turndown conversion failures
    - Provide fallback for malformed HTML
    - Log detailed errors for debugging
3. **Insertion Errors**
    - Handle editor command failures
    - Validate cursor position before insertion
    - Provide user feedback for all failure modes

## Implementation Plan

### Phase 1: Core Implementation (Week 1)

#### Milestone 1.1: Project Setup

- [ ] Initialize project structure following Copy as HTML patterns
- [ ] Set up TypeScript configuration and build scripts
- [ ] Install and configure dependencies (turndown, turndown-plugin-gfm)
- [ ] Create manifest.json with plugin metadata

#### Milestone 1.2: Basic Command Implementation

- [ ] Implement `pasteAsMarkdown` command registration
- [ ] Create basic clipboard HTML reading functionality
- [ ] Implement Turndown service configuration
- [ ] Add cursor insertion logic using `insertText` command
- [ ] Test basic HTML → Markdown conversion

#### Milestone 1.3: User Interface Integration

- [ ] Add keyboard shortcut registration (`Ctrl+Alt+V`)
- [ ] Implement context menu filtering (copy pattern from existing plugin)
- [ ] Add toast notification system for user feedback
- [ ] Test command availability in different editor contexts

### Phase 2: Polish and Testing (Week 2)

#### Milestone 2.1: Table Support Enhancement

- [ ] Verify GFM table conversion functionality
- [ ] Test complex table scenarios (nested formatting, empty cells)
- [ ] Handle table conversion edge cases
- [ ] Validate output formatting consistency

#### Milestone 2.2: Error Handling and Edge Cases

- [ ] Implement comprehensive error handling
- [ ] Test with various HTML input types
- [ ] Handle malformed HTML gracefully
- [ ] Add fallback behaviors for conversion failures

#### Milestone 2.3: Integration Testing

- [ ] Test interaction with existing Copy as HTML plugin
- [ ] Verify context menu behavior in both markdown and rich text editors
- [ ] Test keyboard shortcuts don't conflict
- [ ] Validate plugin loading and unloading

### Phase 3: Documentation and Release Preparation

#### Milestone 3.1: Documentation

- [ ] Write comprehensive README.md
- [ ] Document configuration options and usage
- [ ] Create user guide with examples
- [ ] Add developer documentation for future enhancements

#### Milestone 3.2: Release Preparation

- [ ] Final testing across different Joplin versions
- [ ] Package optimization and size validation
- [ ] Version numbering and changelog preparation
- [ ] Submission preparation for Joplin plugin repository

## Implementation Details

### Key Files Content

#### `constants.ts`

```typescript
export const COMMANDS = {
    PASTE_AS_MARKDOWN: 'pasteAsMarkdown',
} as const;

export const TURNDOWN_OPTIONS = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
} as const;
```

#### `types.ts`

```typescript
export interface PasteOptions {
    // Future expansion for user settings
}

export interface ConversionResult {
    markdown: string;
    success: boolean;
    warnings?: string[];
}
```

#### `markdownConverter.ts`

```typescript
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function convertHtmlToMarkdown(html: string): string {
    const turndownService = createTurndownService();
    return turndownService.turndown(html);
}

function createTurndownService(): TurndownService {
    const service = new TurndownService(TURNDOWN_OPTIONS);
    service.use(gfm); // Enable tables, strikethrough, etc.
    return service;
}
```

### Testing Strategy

1. **Unit Tests**
    - HTML conversion accuracy
    - Edge case handling (empty HTML, malformed markup)
    - Table conversion fidelity
2. **Integration Tests**
    - Clipboard reading functionality
    - Editor insertion behavior
    - Context menu visibility logic
3. **Manual Testing**
    - Cross-platform clipboard compatibility
    - Various HTML sources (browsers, email clients)
    - Complex document structures

### Future Enhancement Opportunities

1. **Settings System**
    - Configurable Turndown options
    - Custom conversion rules
    - Output formatting preferences
2. **Advanced Features**
    - Remote image downloading as Joplin resources
    - Link processing and validation
    - Custom HTML element handling
3. **Integration Features**
    - Batch paste operations
    - Paste with format preview
    - Integration with web clipper functionality

## Success Criteria

### Functional Success

- [ ] Successfully converts HTML clipboard content to markdown
- [ ] Inserts converted content at cursor position without errors
- [ ] Context menu appears only in markdown editor
- [ ] Keyboard shortcut works reliably
- [ ] Tables convert to proper markdown format

### Quality Success

- [ ] Zero crashes or data loss during operation
- [ ] Clear user feedback for all operations
- [ ] Consistent behavior across different HTML sources
- [ ] No conflicts with existing Joplin functionality

### Performance Success

- [ ] Conversion completes in <500ms for typical content
- [ ] No memory leaks during repeated operations
- [ ] Responsive UI during conversion process

This PRP provides a comprehensive roadmap for implementing the Paste as Markdown plugin while leveraging the architectural patterns and best practices established in your existing Copy as HTML plugin.
