import { CircuitRenderer } from './renderer/CircuitRenderer';
import { compile, CompileError } from './compiler/compiler';
import { CircuitIR } from './types';

class App {
    private renderer: CircuitRenderer;
    private codeEditor: HTMLTextAreaElement;
    private errorPanel: HTMLDivElement;
    private statusEl: HTMLSpanElement;
    private editorPanel: HTMLDivElement;

    constructor() {
        const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement;
        this.codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;
        this.errorPanel = document.getElementById('error-panel') as HTMLDivElement;
        this.statusEl = document.getElementById('status') as HTMLSpanElement;
        this.editorPanel = document.getElementById('editor-panel') as HTMLDivElement;

        this.renderer = new CircuitRenderer(canvas);
        this.setupEventListeners();
        
        // Compile initial code
        this.compile();
    }

    private setupEventListeners(): void {
        document.getElementById('compile-btn')?.addEventListener('click', () => this.compile());
        document.getElementById('clear-btn')?.addEventListener('click', () => this.clear());
        
        document.getElementById('editor-toggle')?.addEventListener('click', () => {
            this.editorPanel.classList.toggle('collapsed');
            setTimeout(() => this.renderer.resize(), 200);
        });
        
        this.codeEditor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.compile();
            }
        });
    }

    private compile(): void {
        const code = this.codeEditor.value;
        this.hideError();
        this.setStatus('Compiling...');

        try {
            const ir: CircuitIR = compile(code);
            this.renderer.render(ir);
            this.setStatus(`Compiled: ${ir.components.length} components, ${ir.wires.length} wires`);
        } catch (err) {
            if (err instanceof CompileError) {
                this.showError(err.message);
            } else {
                this.showError(String(err));
            }
            this.setStatus('Compilation failed');
        }
    }

    private clear(): void {
        this.codeEditor.value = '';
        this.renderer.clear();
        this.hideError();
        this.setStatus('Ready');
    }

    private showError(message: string): void {
        this.errorPanel.textContent = message;
        this.errorPanel.classList.remove('hidden');
    }

    private hideError(): void {
        this.errorPanel.classList.add('hidden');
    }

    private setStatus(status: string): void {
        this.statusEl.textContent = status;
    }
}

new App();
