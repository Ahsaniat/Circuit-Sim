/**
 * StatusBar — Bottom status bar with contextual information
 */
export class StatusBar {
    private container: HTMLElement;
    private statusEl!: HTMLSpanElement;
    private statsEl!: HTMLSpanElement;
    private zoomEl!: HTMLSpanElement;
    private cursorEl!: HTMLSpanElement;
    private shortcutEl!: HTMLSpanElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.className = 'status-bar';
        this.build();
    }

    private build(): void {
        // Left section
        const left = document.createElement('div');
        left.className = 'status-bar-section status-bar-left';

        this.statusEl = document.createElement('span');
        this.statusEl.className = 'status-bar-item status-indicator';
        this.statusEl.innerHTML = '<span class="status-dot status-dot-ready"></span> Ready';
        left.appendChild(this.statusEl);

        // Center section
        const center = document.createElement('div');
        center.className = 'status-bar-section status-bar-center';

        this.statsEl = document.createElement('span');
        this.statsEl.className = 'status-bar-item';
        this.statsEl.textContent = '0 components, 0 wires';
        center.appendChild(this.statsEl);

        // Right section
        const right = document.createElement('div');
        right.className = 'status-bar-section status-bar-right';

        this.zoomEl = document.createElement('span');
        this.zoomEl.className = 'status-bar-item';
        this.zoomEl.textContent = '100%';
        right.appendChild(this.zoomEl);

        this.cursorEl = document.createElement('span');
        this.cursorEl.className = 'status-bar-item';
        this.cursorEl.textContent = 'Ln 1, Col 1';
        right.appendChild(this.cursorEl);

        this.shortcutEl = document.createElement('span');
        this.shortcutEl.className = 'status-bar-item status-bar-hint';
        this.shortcutEl.textContent = 'Ctrl+Enter to compile';
        right.appendChild(this.shortcutEl);

        this.container.appendChild(left);
        this.container.appendChild(center);
        this.container.appendChild(right);
    }

    setStatus(text: string, type: 'ready' | 'compiling' | 'error' | 'success' = 'ready'): void {
        const dotClass = `status-dot status-dot-${type}`;
        this.statusEl.innerHTML = `<span class="${dotClass}"></span> ${this.escapeHtml(text)}`;
    }

    setStats(components: number, wires: number): void {
        this.statsEl.textContent = `${components} component${components !== 1 ? 's' : ''}, ${wires} wire${wires !== 1 ? 's' : ''}`;
    }

    setZoom(percent: number): void {
        this.zoomEl.textContent = `${Math.round(percent)}%`;
    }

    setCursor(line: number, col: number): void {
        this.cursorEl.textContent = `Ln ${line}, Col ${col}`;
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
