import { CircuitRenderer } from './renderer/CircuitRenderer';
import { compile, CompileError } from './compiler/compiler';
import { CircuitIR } from './types';
import { Theme } from './ui/Theme';
import { Toast } from './ui/Toast';
import { CodeEditor } from './ui/CodeEditor';
import { ComponentLibrary, collectUsedIds, makeUniqueId } from './ui/ComponentLibrary';
import { StatusBar } from './ui/StatusBar';
import { ZoomControls } from './ui/ZoomControls';
import { Templates } from './ui/Templates';
import { FileManager } from './ui/FileManager';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';
import { SplitPane } from './ui/SplitPane';
import {
    CircuitLayout,
    serializeLayout,
    extractLayout,
    applyLayout,
    layoutToLine,
} from './layout/LayoutSerializer';
import { BreadboardGeometry } from './geometry/BreadboardGeometry';
import { extractNetlist, Netlist } from './simulation/Netlist';
import { simulate } from './simulation/Simulator';
import { runErc } from './erc/Erc';
import { DiagnosticsPanel } from './ui/DiagnosticsPanel';
import { buildBomCsv } from './export/Bom';
import { clearCustomICs, registerCustomIC } from './components/PinDatabase';
import { buildShareUrl, readShareHash } from './share/Permalink';

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

const SESSION_KEY = 'circuitsim-session';

const EMPTY_IR: CircuitIR = { width: 0, height: 0, components: [], boards: [], wires: [] };

interface SessionData {
    code: string;
    layout: CircuitLayout | null;
}

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
    private pendingLayout: CircuitLayout | null = null;
    private autosaveTimer: number | null = null;
    private simActive = false;
    private netlist: Netlist | null = null;
    private diagnostics: DiagnosticsPanel;

    constructor() {
        const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement;
        this.errorPanel = document.getElementById('error-panel') as HTMLDivElement;

        // Core renderer
        this.renderer = new CircuitRenderer(canvas);

        // Theme
        this.theme = new Theme();
        this.theme.mount(document.getElementById('theme-btn')!);
        this.theme.setOnChange(() => this.renderer.refreshTheme());

        // Toast notifications
        this.toast = new Toast();

        // Code editor with syntax highlighting
        const editorContainer = document.getElementById('code-editor-container')!;
        this.codeEditor = new CodeEditor(editorContainer);
        const sharedCode = readShareHash(window.location.hash);
        const session = sharedCode ? null : this.readSession();
        this.codeEditor.value = sharedCode ?? session?.code ?? DEFAULT_CODE;
        this.pendingLayout = sharedCode ? null : session?.layout ?? null;
        if (sharedCode) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        this.codeEditor.setOnCompile(() => this.compile());
        this.codeEditor.setOnChange(() => this.scheduleAutosave());

        // Component library sidebar
        const libContainer = document.getElementById('component-library')!;
        const componentLib = new ComponentLibrary(libContainer);
        componentLib.setOnInsert((code) => this.insertComponentExample(code));

        // Status bar
        this.statusBar = new StatusBar(document.getElementById('status-bar')!);
        this.codeEditor.setOnCursorChange((line, col) => {
            this.statusBar.setCursor(line, col);
        });

        // ERC diagnostics
        this.diagnostics = new DiagnosticsPanel(document.getElementById('diagnostics-panel')!);

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
            this.pendingLayout = null;
            this.codeEditor.value = code;
            this.compile();
            this.toast.success('Template loaded');
        });

        // File manager
        this.fileManager = new FileManager();
        this.fileManager.setOnLoad((rawCode) => {
            const { code, layout } = extractLayout(rawCode);
            this.pendingLayout = layout;
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

        // Drop components from the library onto the canvas
        const canvasPanelEl = document.getElementById('canvas-panel')!;
        canvasPanelEl.addEventListener('dragover', (e) => e.preventDefault());
        canvasPanelEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const code = e.dataTransfer?.getData('text/plain');
            if (!code) return;
            this.insertComponentExample(code);
            this.compile();
            this.toast.success('Component inserted');
        });

        // Canvas edits affect history + autosave
        this.renderer.setOnHistoryChange(() => {
            this.syncHistoryButtons();
            this.scheduleAutosave();
            if (this.simActive) {
                this.runSimulation();
            }
        });

        // Clicking a switch in simulation mode toggles it.
        this.renderer.setOnSwitchToggle(() => {
            if (this.simActive) {
                this.runSimulation();
            }
        });

        // Wire up toolbar buttons
        this.setupToolbar();
        this.setupGlobalShortcuts();

        // Initial compile
        this.compile();
        this.syncHistoryButtons();

        if (sharedCode) {
            this.toast.success('Shared circuit loaded');
        } else if (session) {
            this.toast.info('Session restored');
        }
    }

    private setupToolbar(): void {
        document.getElementById('compile-btn')?.addEventListener('click', () => this.compile());
        document.getElementById('compile-btn-2')?.addEventListener('click', () => this.compile());
        document.getElementById('sim-btn')?.addEventListener('click', () => this.toggleSimulation());
        document.getElementById('clear-btn')?.addEventListener('click', () => this.clear());
        document.getElementById('save-btn')?.addEventListener('click', () => this.save());
        document.getElementById('load-btn')?.addEventListener('click', () => this.fileManager.openFile());
        document.getElementById('export-btn')?.addEventListener('click', () => this.exportPNG());
        document.getElementById('svg-btn')?.addEventListener('click', () => this.exportSVG());
        document.getElementById('bom-btn')?.addEventListener('click', () => this.exportBom());
        document.getElementById('share-btn')?.addEventListener('click', () => this.share());
        document.getElementById('shortcuts-btn')?.addEventListener('click', () => this.shortcuts.toggle());
        document.getElementById('undo-btn')?.addEventListener('click', () => {
            this.renderer.undo();
            this.scheduleAutosave();
        });
        document.getElementById('redo-btn')?.addEventListener('click', () => {
            this.renderer.redo();
            this.scheduleAutosave();
        });
        document.getElementById('rotate-btn')?.addEventListener('click', () => {
            if (this.renderer.rotateSelected()) {
                this.scheduleAutosave();
            } else {
                this.toast.warning('Select a component that can rotate on the board');
            }
        });
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
            if (this.pendingLayout) {
                applyLayout(ir, this.pendingLayout);
                this.pendingLayout = null;
            }
            this.codeEditor.clearError();
            this.renderer.render(ir);
            // Bring the freshly compiled circuit into view instead of
            // leaving the previous pan/zoom pointing at empty canvas.
            this.renderer.fitToView();
            // Rebuild the pin registry from scratch so definitions from an
            // earlier compile cannot shadow this circuit's components.
            clearCustomICs();
            if (ir.customICs) {
                for (const ic of ir.customICs) {
                    registerCustomIC(ic.name, ic.pins);
                }
            }
            this.statusBar.setStats(ir.components.length, ir.wires.length);

            // Extract the netlist once per compile and run the rule check.
            this.netlist = this.buildNetlist(ir);            this.renderer.setNetlist(this.netlist);
            const simCheck = simulate(ir, this.netlist);
            const issues = runErc(ir, this.netlist, simCheck.unsupported);
            this.diagnostics.setIssues(issues);
            const problems = issues.length;
            this.statusBar.setStatus(
                problems > 0 ? `Compiled · ${problems} problem${problems === 1 ? '' : 's'}` : 'Compiled',
                problems > 0 ? 'compiling' : 'success'
            );

            this.syncZoom();
            this.syncHistoryButtons();
            this.scheduleAutosave();
            if (this.simActive) {
                this.runSimulation();
            }
        } catch (err) {
            if (err instanceof CompileError) {
                this.codeEditor.setError(err.line, err.column, err.message);
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
        this.pendingLayout = null;
        this.codeEditor.value = '';
        this.renderer.render(EMPTY_IR);
        this.renderer.setSimulation(null, null);
        this.simActive = false;
        this.netlist = null;
        this.diagnostics.setIssues([]);
        this.syncSimButton();
        this.hideError();
        this.statusBar.setStatus('Ready', 'ready');
        this.statusBar.setStats(0, 0);
        this.syncHistoryButtons();
        this.scheduleAutosave();
        this.toast.info('Editor cleared');
    }

    /**
     * Insert a palette example, renaming its instance id when that id is
     * already declared so insertion never creates a duplicate.
     */
    private insertComponentExample(example: string): void {
        const used = collectUsedIds(this.codeEditor.value);
        const code = makeUniqueId(example, used);
        this.codeEditor.insertText(code);
        this.toast.info(`Inserted: ${code}`);
    }

    private toggleSimulation(): void {
        this.simActive = !this.simActive;
        if (this.simActive) {
            this.runSimulation();
        } else {
            this.netlist = null;
            this.renderer.setSimulation(null, null);
            this.syncSimButton();
            this.statusBar.setStatus('Simulation off', 'ready');
        }
    }

    private buildNetlist(ir: CircuitIR): Netlist {
        const geometries = new Map<string, BreadboardGeometry>();
        for (const board of ir.boards) {
            geometries.set(board.id, new BreadboardGeometry(board.position.x, board.position.y));
        }
        return extractNetlist(ir, geometries, new Set(this.renderer.getClosedSwitches()));
    }

    private runSimulation(): void {
        const ir = this.renderer.getIR();
        if (!ir || ir.components.length === 0) {
            this.toast.warning('Nothing to simulate');
            this.simActive = false;
            this.syncSimButton();
            return;
        }

        this.netlist = this.buildNetlist(ir);
        const result = simulate(ir, this.netlist);
        this.renderer.setSimulation(result, this.netlist);
        this.syncSimButton();
        const lit = result.litLeds.size;
        if (result.unstable) {
            this.statusBar.setStatus('Simulation unstable (oscillating)', 'error');
            this.toast.warning('Circuit oscillates; values shown as unknown');
        } else {
            this.statusBar.setStatus(`Simulation: ${lit} LED${lit === 1 ? '' : 's'} lit`, 'success');
        }
        if (result.unsupported.size > 0) {
            this.toast.warning(`${result.unsupported.size} IC(s) have no simulation model yet`);
        }
    }

    private syncSimButton(): void {
        const btn = document.getElementById('sim-btn');
        if (!btn) return;
        btn.classList.toggle('active', this.simActive);
        btn.setAttribute('aria-pressed', String(this.simActive));
    }

    private save(): void {
        const code = this.codeEditor.value;
        const ir = this.renderer.getIR();
        const layout = ir ? serializeLayout(ir) : null;
        const contents = layout ? `${code}\n${layoutToLine(layout)}` : code;
        this.fileManager.saveFile(contents);
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
                const filename = `circuit-${this.timestamp()}.png`;
                this.downloadBlob(blob, filename);
                this.toast.success(`Exported: ${filename}`);
                this.statusBar.setStatus('Exported', 'success');
            });
        } catch (err) {
            this.toast.error(`Export error: ${err}`);
            this.statusBar.setStatus('Export failed', 'error');
        }
    }

    private exportSVG(): void {
        try {
            const svg = this.renderer.exportSVG();
            if (!svg) {
                this.toast.error('Nothing to export');
                return;
            }
            const filename = `circuit-${this.timestamp()}.svg`;
            this.downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
            this.toast.success(`Exported: ${filename}`);
        } catch (err) {
            this.toast.error(`Export error: ${err}`);
        }
    }

    private exportBom(): void {
        const ir = this.renderer.getIR();
        if (!ir || ir.components.length === 0) {
            this.toast.warning('Nothing to export');
            return;
        }
        const filename = `bom-${this.timestamp()}.csv`;
        this.downloadBlob(new Blob([buildBomCsv(ir)], { type: 'text/csv' }), filename);
        this.toast.success(`Exported: ${filename}`);
    }

    private share(): void {
        const url = buildShareUrl(window.location.href, this.codeEditor.value);
        const clipboard = navigator.clipboard;
        if (clipboard?.writeText) {
            clipboard.writeText(url)
                .then(() => this.toast.success('Share link copied to clipboard'))
                .catch(() => this.toast.info(`Share link: ${url}`));
        } else {
            this.toast.info(`Share link: ${url}`);
        }
    }

    private downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private timestamp(): string {
        return new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
    }

    private syncZoom(): void {
        const percent = this.renderer.getZoom();
        this.zoomControls.setZoom(percent);
        this.statusBar.setZoom(percent);
    }

    private syncHistoryButtons(): void {
        const undo = document.getElementById('undo-btn') as HTMLButtonElement | null;
        const redo = document.getElementById('redo-btn') as HTMLButtonElement | null;
        if (undo) undo.disabled = !this.renderer.canUndo();
        if (redo) redo.disabled = !this.renderer.canRedo();
    }

    private scheduleAutosave(): void {
        if (this.autosaveTimer !== null) {
            window.clearTimeout(this.autosaveTimer);
        }
        this.autosaveTimer = window.setTimeout(() => this.saveSession(), 800);
    }

    private saveSession(): void {
        const ir = this.renderer.getIR();
        const layout = ir ? serializeLayout(ir) : null;
        const data: SessionData = { code: this.codeEditor.value, layout };
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        } catch {
            // Storage can be unavailable (private mode, quota); autosave is best-effort.
        }
    }

    private readSession(): SessionData | null {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as SessionData;
            if (typeof parsed.code !== 'string') return null;
            return { code: parsed.code, layout: parsed.layout ?? null };
        } catch {
            return null;
        }
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
