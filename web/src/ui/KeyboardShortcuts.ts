/**
 * KeyboardShortcuts — Modal showing all keyboard shortcuts
 */

interface ShortcutEntry {
    keys: string;
    description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
    { keys: 'Ctrl + Enter', description: 'Compile circuit' },
    { keys: 'Ctrl + S', description: 'Save circuit file' },
    { keys: 'Ctrl + O', description: 'Open circuit file' },
    { keys: 'Ctrl + Shift + E', description: 'Export as PNG' },
    { keys: 'Ctrl + /', description: 'Show keyboard shortcuts' },
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
    { keys: 'Tab', description: 'Insert 4 spaces in editor' },
];

export class KeyboardShortcuts {
    private overlay: HTMLDivElement | null = null;

    show(): void {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'shortcuts-overlay';

        const modal = document.createElement('div');
        modal.className = 'shortcuts-modal';

        const header = document.createElement('div');
        header.className = 'shortcuts-header';
        header.innerHTML = `
            <h2>Keyboard Shortcuts</h2>
            <button class="shortcuts-close" aria-label="Close">&times;</button>
        `;
        modal.appendChild(header);

        const body = document.createElement('div');
        body.className = 'shortcuts-body';

        for (const shortcut of SHORTCUTS) {
            const row = document.createElement('div');
            row.className = 'shortcuts-row';
            row.innerHTML = `
                <span class="shortcuts-keys">${this.renderKeys(shortcut.keys)}</span>
                <span class="shortcuts-desc">${shortcut.description}</span>
            `;
            body.appendChild(row);
        }

        modal.appendChild(body);
        this.overlay.appendChild(modal);
        document.body.appendChild(this.overlay);

        // Close events
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        modal.querySelector('.shortcuts-close')?.addEventListener('click', () => this.close());

        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    close(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    toggle(): void {
        this.overlay ? this.close() : this.show();
    }

    private renderKeys(keys: string): string {
        return keys.split(' + ').map(k =>
            `<kbd>${k.trim()}</kbd>`
        ).join('<span class="key-plus">+</span>');
    }
}
