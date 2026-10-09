/**
 * Theme — dark/light mode driven by the data-theme attribute.
 *
 * All tokens live in index.html (CSS custom properties); this class only
 * toggles the attribute and persists the choice, so there is exactly one
 * source of truth for colors.
 */
export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'circuitsim-theme';

export class Theme {
    private mode: ThemeMode;
    private toggleBtn: HTMLElement | null = null;
    private onChange: ((mode: ThemeMode) => void) | null = null;

    constructor() {
        const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
        this.mode = saved === 'dark' ? 'dark' : 'light';
        this.apply();
    }

    mount(container: HTMLElement): void {
        this.toggleBtn = container;
        this.updateButton();
        container.addEventListener('click', () => this.toggle());
    }

    setOnChange(fn: (mode: ThemeMode) => void): void {
        this.onChange = fn;
    }

    toggle(): void {
        this.mode = this.mode === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, this.mode);
        this.apply();
        this.updateButton();
        this.onChange?.(this.mode);
    }

    getMode(): ThemeMode {
        return this.mode;
    }

    private apply(): void {
        document.documentElement.setAttribute('data-theme', this.mode);
    }

    private updateButton(): void {
        if (!this.toggleBtn) return;
        this.toggleBtn.innerHTML = this.mode === 'dark'
            ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12a4 4 0 100-8 4 4 0 000 8zm0 1.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM8 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V.75A.75.75 0 018 0zm0 12a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 12zM2.34 2.34a.75.75 0 011.06 0l1.06 1.06a.75.75 0 01-1.06 1.06L2.34 3.4a.75.75 0 010-1.06zm9.2 9.2a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM0 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H.75A.75.75 0 010 8zm12 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0112 8zM2.34 13.66a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zm9.2-9.2a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0z"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9.598 1.591a.75.75 0 01.785-.175 7 7 0 11-8.967 8.967.75.75 0 01.961-.96 5.5 5.5 0 007.046-7.046.75.75 0 01.175-.786z"/></svg>';
        this.toggleBtn.title = this.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        this.toggleBtn.setAttribute('aria-label', this.toggleBtn.title);
    }
}
