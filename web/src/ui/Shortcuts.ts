/**
 * Single source of truth for the keyboard shortcut reference shown in the
 * shortcuts modal.
 */
export interface ShortcutEntry {
    keys: string;
    description: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
    { keys: 'Ctrl + Enter', description: 'Compile circuit' },
    { keys: 'Ctrl + S', description: 'Save circuit file' },
    { keys: 'Ctrl + O', description: 'Open circuit file' },
    { keys: 'Ctrl + Shift + E', description: 'Export as PNG' },
    { keys: 'Ctrl + /', description: 'Show keyboard shortcuts' },
    { keys: 'Ctrl + Z', description: 'Undo canvas edit' },
    { keys: 'Ctrl + Shift + Z', description: 'Redo canvas edit' },
    { keys: 'Ctrl + +', description: 'Zoom in' },
    { keys: 'Ctrl + -', description: 'Zoom out' },
    { keys: 'Ctrl + 0', description: 'Reset zoom' },
    { keys: 'F', description: 'Fit circuit to view' },
    { keys: 'Scroll wheel', description: 'Zoom canvas' },
    { keys: 'Space + drag', description: 'Pan canvas' },
    { keys: 'Middle-drag', description: 'Pan canvas' },
    { keys: 'Pinch (touch)', description: 'Zoom canvas' },
    { keys: 'Click + drag', description: 'Move components / wires' },
    { keys: 'Delete', description: 'Delete selected element' },
    { keys: 'Escape', description: 'Clear selection' },
    { keys: 'Tab', description: 'Indent in editor' },
];
