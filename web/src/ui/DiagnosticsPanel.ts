import { ErcIssue } from '../erc/Erc';

/**
 * DiagnosticsPanel — lists ERC findings under the editor.
 */
export class DiagnosticsPanel {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.className = 'diagnostics-panel hidden';
    }

    setIssues(issues: ErcIssue[]): void {
        this.container.innerHTML = '';
        if (issues.length === 0) {
            this.container.classList.add('hidden');
            return;
        }
        this.container.classList.remove('hidden');

        const header = document.createElement('div');
        header.className = 'diagnostics-header';
        const errors = issues.filter(i => i.severity === 'error').length;
        const warnings = issues.filter(i => i.severity === 'warning').length;
        header.textContent = `Problems: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
        this.container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'diagnostics-list';
        for (const issue of issues) {
            const row = document.createElement('div');
            row.className = `diagnostics-item diagnostics-${issue.severity}`;
            const icon = issue.severity === 'error' ? '✕' : issue.severity === 'warning' ? '!' : 'i';
            row.innerHTML = `<span class="diagnostics-icon">${icon}</span><span>${this.escape(issue.message)}</span>`;
            list.appendChild(row);
        }
        this.container.appendChild(list);
    }

    private escape(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
