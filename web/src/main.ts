import { CircuitRenderer } from './renderer/CircuitRenderer';
import { compile, CompileError } from './compiler/compiler';
import { CircuitIR } from './types';
import { Theme } from './ui/Theme';
import { Toast } from './ui/Toast';
import { CodeEditor } from './ui/CodeEditor';
import { ComponentLibrary } from './ui/ComponentLibrary';
import { StatusBar } from './ui/StatusBar';
import { ZoomControls } from './ui/ZoomControls';
import { Templates } from './ui/Templates';
import { FileManager } from './ui/FileManager';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';
import { SplitPane } from './ui/SplitPane';

const DEFAULT_CODE = `// LED Circuit with Logic Gates
@AND A1 7408
@resistor R1 330
@led LED1 red
@npn Q1 2N2222
@board B1 breadboard_830

map (
    (A1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
    (A1 pin 6 -> Q1 pin 1)
)`;

class App {
    private renderer: CircuitRenderer;
    private codeEditor: CodeEditor;
    private errorPanel: HTMLDivElement;
    private theme: Theme;
    private toast: Toast;
    private statusBar: StatusBar;
    private zoomControls: ZoomControls;
    private templates: Templates;
    private fileManager: FileManager;
    private shortcuts: KeyboardShortcuts;

    constructor() {
        const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement;
        this.errorPanel = document.getElementById('error-panel') as HTMLDivElement;

        // Core renderer
        this.renderer = new CircuitRenderer(canvas);

        // Theme
        this.theme = new Theme();
        this.theme.mount(document.getElementById('theme-btn')!);

        // Toast notifications
        this.toast = new Toast();

        // Code editor with syntax highlighting
        const editorContainer = document.getElementById('code-editor-container')!;
        this.codeEditor = new CodeEditor(editorContainer);
        this.codeEditor.value = DEFAULT_CODE;
        this.codeEditor.setOnCompile(() => this.compile());

        // Component library sidebar
        const libContainer = document.getElementById('component-library')!;
        const componentLib = new ComponentLibrary(libContainer);
        componentLib.setOnInsert((code) => {
            this.codeEditor.insertText(code);
            this.toast.info(`Inserted: ${code}`);
        });

        // Status bar
        this.statusBar = new StatusBar(document.getElementById('status-bar')!);
        this.codeEditor.setOnCursorChange((line, col) => {
            this.statusBar.setCursor(line, col);
        });

        // Zoom controls
        const canvasPanel = document.getElementById('canvas-panel')!;
        this.zoomControls = new ZoomControls(canvasPanel);
        this.zoomControls.setCallbacks(
            () => { this.renderer.zoomIn(); this.syncZoom(); },
            () => { this.renderer.zoomOut(); this.syncZoom(); },
            () => { this.renderer.resetZoom(); this.syncZoom(); },
            () => { this.renderer.fitToView(); this.syncZoom(); }
        );

        // Templates dropdown
        this.templates = new Templates(document.getElementById('templates-btn')!);
        this.templates.setOnSelect((code) => {
            this.codeEditor.value = code;
            this.compile();
            this.toast.success('Template loaded');
        });

        // File manager
        this.fileManager = new FileManager();
        this.fileManager.setOnLoad((code) => {
            this.codeEditor.value = code;
            this.compile();
            this.toast.success('Circuit loaded');
        });

        // Keyboard shortcuts modal
        this.shortcuts = new KeyboardShortcuts();

        // Split pane resizer
        const mainArea = document.getElementById('main-area')!;
        const leftPanel = document.getElementById('left-panel')!;
        const _rightPanel = document.getElementById('canvas-panel')!;
        new SplitPane(mainArea, leftPanel, _rightPanel);

        // Wire up toolbar buttons
        this.setupToolbar();
        this.setupGlobalShortcuts();

        // Initial compile
        this.compile();
    }

    private setupToolbar(): void {
        document.getElementById('compile-btn')?.addEventListener('click', () => this.compile());
        document.getElementById('compile-btn-2')?.addEventListener('click', () => this.compile());
        document.getElementById('clear-btn')?.addEventListener('click', () => this.clear());
        document.getElementById('save-btn')?.addEventListener('click', () => this.save());
        document.getElementById('load-btn')?.addEventListener('click', () => this.fileManager.openFile());
        document.getElementById('export-btn')?.addEventListener('click', () => this.exportPNG());
        document.getElementById('shortcuts-btn')?.addEventListener('click', () => this.shortcuts.toggle());
    }

    private setupGlobalShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            // Ctrl+S — Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.save();
            }
            // Ctrl+O — Open
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.fileManager.openFile();
            }
            // Ctrl+Shift+E — Export PNG
            if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                e.preventDefault();
                this.exportPNG();
            }
            // Ctrl+/ — Shortcuts
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                this.shortcuts.toggle();
            }
            // Ctrl++ — Zoom in
            if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                this.renderer.zoomIn();
                this.syncZoom();
            }
            // Ctrl+- — Zoom out
            if (e.ctrlKey && e.key === '-') {
                e.preventDefault();
                this.renderer.zoomOut();
                this.syncZoom();
            }
            // Ctrl+0 — Reset zoom
            if (e.ctrlKey && e.key === '0') {
                e.preventDefault();
                this.renderer.resetZoom();
                this.syncZoom();
            }
        });

        // Sync zoom on scroll (the renderer handles scroll-zoom internally)
        document.getElementById('circuit-canvas')?.addEventListener('wheel', () => {
            requestAnimationFrame(() => this.syncZoom());
        });
    }

    private compile(): void {
        const code = this.codeEditor.value;
        this.hideError();
        this.statusBar.setStatus('Compiling...', 'compiling');

        try {
            const ir: CircuitIR = compile(code);
            this.renderer.render(ir);
            this.statusBar.setStatus('Compiled', 'success');
            this.statusBar.setStats(ir.components.length, ir.wires.length);
            this.syncZoom();
        } catch (err) {
            if (err instanceof CompileError) {
                this.showError(err.message);
                this.toast.error(err.message);
            } else {
                this.showError(String(err));
                this.toast.error(String(err));
            }
            this.statusBar.setStatus('Error', 'error');
        }
    }

    private clear(): void {
        this.codeEditor.value = '';
        this.renderer.clear();
        this.hideError();
        this.statusBar.setStatus('Ready', 'ready');
        this.statusBar.setStats(0, 0);
        this.toast.info('Editor cleared');
    }

    private save(): void {
        this.fileManager.saveFile(this.codeEditor.value);
        this.toast.success('Circuit saved');
    }

    private exportPNG(): void {
        this.statusBar.setStatus('Exporting PNG...', 'compiling');

        try {
            this.renderer.exportCanvas((blob) => {
                if (!blob) {
                    this.toast.error('Failed to generate PNG');
                    this.statusBar.setStatus('Export failed', 'error');
                    return;
                }
                const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
                const filename = `circuit-${timestamp}.png`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.toast.success(`Exported: ${filename}`);
                this.statusBar.setStatus('Exported', 'success');
            });
        } catch (err) {
            this.toast.error(`Export error: ${err}`);
            this.statusBar.setStatus('Export failed', 'error');
        }
    }

    private syncZoom(): void {
        const percent = this.renderer.getZoom();
        this.zoomControls.setZoom(percent);
        this.statusBar.setZoom(percent);
    }

    private showError(message: string): void {
        this.errorPanel.textContent = message;
        this.errorPanel.classList.remove('hidden');
    }

    private hideError(): void {
        this.errorPanel.classList.add('hidden');
    }
}

new App();
