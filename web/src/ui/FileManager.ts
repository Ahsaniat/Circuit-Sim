/**
 * FileManager — Save/Load .csim circuit files
 */
export class FileManager {
    private onLoad: ((code: string) => void) | null = null;

    setOnLoad(fn: (code: string) => void): void {
        this.onLoad = fn;
    }

    saveFile(code: string, filename?: string): void {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
        const name = filename || `circuit-${timestamp}.csim`;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    openFile(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csim,.txt';

        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                const code = reader.result as string;
                this.onLoad?.(code);
            };
            reader.readAsText(file);
        });

        input.click();
    }
}
