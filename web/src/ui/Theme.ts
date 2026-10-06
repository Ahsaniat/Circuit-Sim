/**
 * Theme — Dark/Light theme management with CSS custom properties
 */
export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'circuitsim-theme';

const THEMES: Record<ThemeMode, Record<string, string>> = {
    dark: {
        '--bg-primary': '#0d1117',
        '--bg-secondary': '#161b22',
        '--bg-tertiary': '#1c2128',
        '--bg-elevated': '#21262d',
        '--bg-canvas': '#0d1117',
        '--bg-input': '#0d1117',
        '--bg-hover': '#292e36',
        '--bg-active': '#2d333b',
        '--border-primary': '#30363d',
        '--border-secondary': '#21262d',
        '--border-accent': '#58a6ff',
        '--text-primary': '#e6edf3',
        '--text-secondary': '#8b949e',
        '--text-tertiary': '#6e7681',
        '--text-link': '#58a6ff',
        '--accent': '#58a6ff',
        '--accent-hover': '#79c0ff',
        '--accent-muted': '#1f3a5f',
        '--success': '#3fb950',
        '--success-muted': '#1a4028',
        '--warning': '#d29922',
        '--warning-muted': '#3d2e00',
        '--error': '#f85149',
        '--error-muted': '#4a1c1c',
        '--info': '#58a6ff',
        '--info-muted': '#1f3a5f',
        '--shadow': '0 4px 12px rgba(0,0,0,0.4)',
        '--shadow-lg': '0 8px 24px rgba(0,0,0,0.6)',
        '--editor-bg': '#0d1117',
        '--editor-gutter': '#161b22',
        '--editor-line-hl': '#161b22',
        '--canvas-bg': '#0e1116',
        '--breadboard-bg': '#e8e4df',
        '--scrollbar-track': '#161b22',
        '--scrollbar-thumb': '#30363d',
        '--overlay-bg': 'rgba(0,0,0,0.5)',
    },
    light: {
        '--bg-primary': '#ffffff',
        '--bg-secondary': '#f6f8fa',
        '--bg-tertiary': '#f0f2f5',
        '--bg-elevated': '#ffffff',
        '--bg-canvas': '#f5f5f5',
        '--bg-input': '#ffffff',
        '--bg-hover': '#eaeef2',
        '--bg-active': '#dce1e6',
        '--border-primary': '#d0d7de',
        '--border-secondary': '#e1e4e8',
        '--border-accent': '#0969da',
        '--text-primary': '#1f2328',
        '--text-secondary': '#656d76',
        '--text-tertiary': '#8b949e',
        '--text-link': '#0969da',
        '--accent': '#0969da',
        '--accent-hover': '#0550ae',
        '--accent-muted': '#ddf4ff',
        '--success': '#1a7f37',
        '--success-muted': '#dafbe1',
        '--warning': '#9a6700',
        '--warning-muted': '#fff8c5',
        '--error': '#cf222e',
        '--error-muted': '#ffebe9',
        '--info': '#0969da',
        '--info-muted': '#ddf4ff',
        '--shadow': '0 4px 12px rgba(0,0,0,0.08)',
        '--shadow-lg': '0 8px 24px rgba(0,0,0,0.12)',
        '--editor-bg': '#ffffff',
        '--editor-gutter': '#f6f8fa',
        '--editor-line-hl': '#f6f8fa',
        '--canvas-bg': '#f5f5f5',
        '--breadboard-bg': '#e8e4df',
        '--scrollbar-track': '#f0f2f5',
        '--scrollbar-thumb': '#c1c7cd',
        '--overlay-bg': 'rgba(0,0,0,0.3)',
    },
};

export class Theme {
    private mode: ThemeMode;
    private toggleBtn: HTMLElement | null = null;

    constructor() {
        const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
        this.mode = saved || 'dark';
        this.apply();
    }

    mount(container: HTMLElement): void {
        this.toggleBtn = container;
        this.updateButton();
        container.addEventListener('click', () => this.toggle());
    }

    toggle(): void {
        this.mode = this.mode === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, this.mode);
        this.apply();
        this.updateButton();
    }

    getMode(): ThemeMode {
        return this.mode;
    }

    private apply(): void {
        const vars = THEMES[this.mode];
        const root = document.documentElement;
        for (const [key, value] of Object.entries(vars)) {
            root.style.setProperty(key, value);
        }
        root.setAttribute('data-theme', this.mode);
    }

    private updateButton(): void {
        if (!this.toggleBtn) return;
        this.toggleBtn.innerHTML = this.mode === 'dark'
            ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12a4 4 0 100-8 4 4 0 000 8zm0 1.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM8 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V.75A.75.75 0 018 0zm0 12a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 12zM2.34 2.34a.75.75 0 011.06 0l1.06 1.06a.75.75 0 01-1.06 1.06L2.34 3.4a.75.75 0 010-1.06zm9.2 9.2a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM0 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H.75A.75.75 0 010 8zm12 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0112 8zM2.34 13.66a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zm9.2-9.2a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0z"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9.598 1.591a.75.75 0 01.785-.175 7 7 0 11-8.967 8.967.75.75 0 01.961-.96 5.5 5.5 0 007.046-7.046.75.75 0 01.175-.786z"/></svg>';
        this.toggleBtn.title = this.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
}
