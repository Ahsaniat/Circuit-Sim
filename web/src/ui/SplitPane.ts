/**
 * SplitPane — Draggable resizer between two panels
 */

const STORAGE_KEY = 'circuitsim-split';

export class SplitPane {
    private container: HTMLElement;
    private leftPanel: HTMLElement;
    private handle: HTMLDivElement;
    private isDragging = false;
    private minWidth: number;
    private maxWidth: number;

    constructor(
        container: HTMLElement,
        leftPanel: HTMLElement,
        _rightPanel: HTMLElement,
        minWidth = 240,
        maxWidth = 600
    ) {
        this.container = container;
        this.leftPanel = leftPanel;
        this.minWidth = minWidth;
        this.maxWidth = maxWidth;

        this.handle = document.createElement('div');
        this.handle.className = 'split-handle';
        this.handle.innerHTML = '<div class="split-handle-bar"></div>';

        // Insert handle between panels
        this.leftPanel.after(this.handle);

        this.setupDrag();
        this.restore();
    }

    private setupDrag(): void {
        this.handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.isDragging = true;
            this.handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const containerRect = this.container.getBoundingClientRect();
            let newWidth = e.clientX - containerRect.left;
            newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));
            this.leftPanel.style.width = `${newWidth}px`;
            this.leftPanel.style.flexShrink = '0';
        });

        document.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.handle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            this.save();
            // Notify canvas to resize
            window.dispatchEvent(new Event('resize'));
        });
    }

    private save(): void {
        const width = this.leftPanel.getBoundingClientRect().width;
        localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
    }

    private restore(): void {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const width = parseInt(saved, 10);
            if (width >= this.minWidth && width <= this.maxWidth) {
                this.leftPanel.style.width = `${width}px`;
                this.leftPanel.style.flexShrink = '0';
            }
        }
    }
}
