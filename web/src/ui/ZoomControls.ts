/**
 * ZoomControls — Floating zoom controls overlay on canvas
 */
export class ZoomControls {
    private container: HTMLElement;
    private zoomLabel!: HTMLSpanElement;
    private onZoomIn: (() => void) | null = null;
    private onZoomOut: (() => void) | null = null;
    private onZoomReset: (() => void) | null = null;

    constructor(parent: HTMLElement) {
        this.container = document.createElement('div');
        this.container.className = 'zoom-controls';
        this.build();
        parent.appendChild(this.container);
    }

    setCallbacks(onIn: () => void, onOut: () => void, onReset: () => void): void {
        this.onZoomIn = onIn;
        this.onZoomOut = onOut;
        this.onZoomReset = onReset;
    }

    setZoom(percent: number): void {
        this.zoomLabel.textContent = `${Math.round(percent)}%`;
    }

    private build(): void {
        const zoomIn = this.createButton('+', 'Zoom in', () => this.onZoomIn?.());
        const zoomOut = this.createButton('−', 'Zoom out', () => this.onZoomOut?.());

        this.zoomLabel = document.createElement('span');
        this.zoomLabel.className = 'zoom-label';
        this.zoomLabel.textContent = '100%';
        this.zoomLabel.title = 'Reset zoom';
        this.zoomLabel.addEventListener('click', () => this.onZoomReset?.());

        const resetBtn = this.createButton(
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a5.95 5.95 0 00-4.24 1.76l-.71-.71A.75.75 0 002 3.75V7h3.25a.75.75 0 00.53-1.28l-.97-.97A4.5 4.5 0 1112.5 8a.75.75 0 011.5 0A6 6 0 118 2z"/></svg>',
            'Reset zoom',
            () => this.onZoomReset?.()
        );

        this.container.appendChild(zoomIn);
        this.container.appendChild(this.zoomLabel);
        this.container.appendChild(zoomOut);
        this.container.appendChild(resetBtn);
    }

    private createButton(html: string, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'zoom-btn';
        btn.innerHTML = html;
        btn.title = title;
        btn.addEventListener('click', onClick);
        return btn;
    }
}
