/**
 * Toast — Floating notification system
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
}

export class Toast {
    private container: HTMLDivElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(options: ToastOptions): void {
        const { message, type = 'info', duration = 3500 } = options;

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <span class="toast-icon">${this.getIcon(type)}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Close">&times;</button>
        `;

        el.querySelector('.toast-close')?.addEventListener('click', () => this.dismiss(el));
        this.container.appendChild(el);

        // Trigger animation
        requestAnimationFrame(() => el.classList.add('toast-visible'));

        if (duration > 0) {
            setTimeout(() => this.dismiss(el), duration);
        }
    }

    success(message: string): void {
        this.show({ message, type: 'success' });
    }

    error(message: string, duration = 6000): void {
        this.show({ message, type: 'error', duration });
    }

    warning(message: string): void {
        this.show({ message, type: 'warning' });
    }

    info(message: string): void {
        this.show({ message, type: 'info' });
    }

    private dismiss(el: HTMLDivElement): void {
        el.classList.remove('toast-visible');
        el.classList.add('toast-exit');
        setTimeout(() => el.remove(), 300);
    }

    private getIcon(type: ToastType): string {
        switch (type) {
            case 'success': return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z"/></svg>';
            case 'error': return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0 012.343 13.657zM6.03 4.97a.75.75 0 00-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 101.06 1.06L8 9.06l1.97 1.97a.75.75 0 101.06-1.06L9.06 8l1.97-1.97a.75.75 0 10-1.06-1.06L8 6.94 6.03 4.97z"/></svg>';
            case 'warning': return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 00-.75.75v2.5a.75.75 0 001.5 0v-2.5A.75.75 0 008 5zm1 7a1 1 0 10-2 0 1 1 0 002 0z"/></svg>';
            case 'info': return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-3a1 1 0 100-2 1 1 0 000 2zm-.25 8.25a.75.75 0 001.5 0v-5.5a.75.75 0 00-1.5 0v5.5z"/></svg>';
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
