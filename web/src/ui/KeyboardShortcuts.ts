/**
 * KeyboardShortcuts — accessible modal showing all keyboard shortcuts.
 */
import { SHORTCUTS } from './Shortcuts';

export class KeyboardShortcuts {
    private overlay: HTMLDivElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;
    private lastFocused: HTMLElement | null = null;

    show(): void {
        if (this.overlay) return;

        this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.overlay = document.createElement('div');
        this.overlay.className = 'shortcuts-overlay';

        const modal = document.createElement('div');
        modal.className = 'shortcuts-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'shortcuts-title');

        const header = document.createElement('div');
        header.className = 'shortcuts-header';
        header.innerHTML = `
            <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
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
        const closeBtn = modal.querySelector<HTMLButtonElement>('.shortcuts-close');
        closeBtn?.addEventListener('click', () => this.close());
        closeBtn?.focus();

        // Escape closes; Tab is trapped inside the dialog.
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
                return;
            }
            if (e.key === 'Tab') {
                const focusable = modal.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }

    close(): void {
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.lastFocused?.focus();
        this.lastFocused = null;
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
