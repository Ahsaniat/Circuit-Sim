/**
 * CodeEditor — Enhanced code editor with line numbers and syntax highlighting
 */

// DSL syntax tokens for highlighting
const DSL_KEYWORDS = ['map', 'pin', 'def', 'input', 'output', 'gnd', 'vcc'];
const DSL_COMPONENT_TYPES = [
    'resistor', 'capacitor', 'inductor', 'potentiometer',
    'diode', 'zener_diode', 'schottky_diode',
    'led', 'ir_led', 'photodiode', 'ldr',
    'npn', 'pnp', 'nmos', 'pmos',
    'AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT',
    'AND3', 'NAND3', 'NOR3', 'AND4', 'NAND4',
    'mux_4x1', 'mux_8x1',
    'decoder_3to8', 'decoder_2to4', 'encoder_8to3',
    'shift_reg_8', 'shift_reg_8_parallel',
    'd_flipflop', 'jk_flipflop', 'latch_8',
    'counter_4bit', 'counter_decade',
    'switch_spst', 'switch_spdt', 'pushbutton',
    'display_7seg', 'buzzer', 'passive_buzzer',
    'motor_dc', 'servo',
    'battery', 'regulator',
    'crystal', 'comp', 'board',
];

export class CodeEditor {
    private container: HTMLElement;
    private textarea: HTMLTextAreaElement;
    private highlightLayer: HTMLDivElement;
    private gutterEl: HTMLDivElement;
    private onCompile: (() => void) | null = null;
    private onChange: (() => void) | null = null;
    private _cursorLine = 1;
    private _cursorCol = 1;
    private onCursorChange: ((line: number, col: number) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.classList.add('code-editor-wrapper');

        // Gutter for line numbers
        this.gutterEl = document.createElement('div');
        this.gutterEl.className = 'code-editor-gutter';
        this.container.appendChild(this.gutterEl);

        // Editor area (highlight + textarea stacked)
        const editorArea = document.createElement('div');
        editorArea.className = 'code-editor-area';

        this.highlightLayer = document.createElement('div');
        this.highlightLayer.className = 'code-editor-highlight';
        this.highlightLayer.setAttribute('aria-hidden', 'true');
        editorArea.appendChild(this.highlightLayer);

        this.textarea = document.createElement('textarea');
        this.textarea.className = 'code-editor-input';
        this.textarea.spellcheck = false;
        this.textarea.setAttribute('autocomplete', 'off');
        this.textarea.setAttribute('autocorrect', 'off');
        this.textarea.setAttribute('autocapitalize', 'off');
        editorArea.appendChild(this.textarea);

        this.container.appendChild(editorArea);

        this.setupEventListeners();
        this.updateGutter();
        this.updateHighlight();
    }

    get value(): string {
        return this.textarea.value;
    }

    set value(code: string) {
        this.textarea.value = code;
        this.updateGutter();
        this.updateHighlight();
    }

    get cursorLine(): number { return this._cursorLine; }
    get cursorCol(): number { return this._cursorCol; }

    setOnCompile(fn: () => void): void {
        this.onCompile = fn;
    }

    setOnChange(fn: () => void): void {
        this.onChange = fn;
    }

    setOnCursorChange(fn: (line: number, col: number) => void): void {
        this.onCursorChange = fn;
    }

    focus(): void {
        this.textarea.focus();
    }

    insertText(text: string): void {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const before = this.textarea.value.substring(0, start);
        const after = this.textarea.value.substring(end);

        // Add newline before if not at start and previous char isn't newline
        const needsNewline = before.length > 0 && !before.endsWith('\n');
        const insertText = (needsNewline ? '\n' : '') + text + '\n';

        this.textarea.value = before + insertText + after;
        this.textarea.selectionStart = this.textarea.selectionEnd = start + insertText.length;
        this.textarea.focus();
        this.updateGutter();
        this.updateHighlight();
    }

    private setupEventListeners(): void {
        this.textarea.addEventListener('input', () => {
            this.updateGutter();
            this.updateHighlight();
            this.onChange?.();
        });

        this.textarea.addEventListener('scroll', () => {
            this.highlightLayer.scrollTop = this.textarea.scrollTop;
            this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
            this.gutterEl.scrollTop = this.textarea.scrollTop;
        });

        this.textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.onCompile?.();
            }

            // Tab key inserts 4 spaces
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.textarea.selectionStart;
                const end = this.textarea.selectionEnd;
                this.textarea.value =
                    this.textarea.value.substring(0, start) +
                    '    ' +
                    this.textarea.value.substring(end);
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
                this.updateGutter();
                this.updateHighlight();
            }
        });

        // Track cursor position
        const updateCursor = () => {
            const val = this.textarea.value;
            const pos = this.textarea.selectionStart;
            const beforeCursor = val.substring(0, pos);
            const lines = beforeCursor.split('\n');
            this._cursorLine = lines.length;
            this._cursorCol = lines[lines.length - 1].length + 1;
            this.onCursorChange?.(this._cursorLine, this._cursorCol);
        };

        this.textarea.addEventListener('click', updateCursor);
        this.textarea.addEventListener('keyup', updateCursor);
        this.textarea.addEventListener('input', updateCursor);
    }

    private updateGutter(): void {
        const lineCount = this.textarea.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += `<div class="gutter-line">${i}</div>`;
        }
        this.gutterEl.innerHTML = html;
    }

    private updateHighlight(): void {
        const code = this.textarea.value;
        this.highlightLayer.innerHTML = this.highlightSyntax(code);
    }

    private highlightSyntax(code: string): string {
        const lines = code.split('\n');
        return lines.map(line => {
            let html = this.escapeHtml(line);

            // Comments
            const commentIdx = html.indexOf('//');
            if (commentIdx >= 0) {
                html = html.substring(0, commentIdx) +
                    `<span class="hl-comment">${html.substring(commentIdx)}</span>`;
                return `<div class="hl-line">${html || '&nbsp;'}</div>`;
            }

            // @keyword tokens
            html = html.replace(/@(\w+)/g, (_match, word) => {
                if (DSL_COMPONENT_TYPES.includes(word) || word === 'comp' || word === 'board') {
                    return `<span class="hl-component">@${word}</span>`;
                }
                return `<span class="hl-unknown">@${word}</span>`;
            });

            // Keywords
            for (const kw of DSL_KEYWORDS) {
                const re = new RegExp(`\\b(${kw})\\b`, 'g');
                html = html.replace(re, `<span class="hl-keyword">$1</span>`);
            }

            // Numbers
            html = html.replace(/\b(\d+)\b/g, `<span class="hl-number">$1</span>`);

            // Arrows
            html = html.replace(/-&gt;/g, `<span class="hl-arrow">-&gt;</span>`);

            // Parentheses
            html = html.replace(/([()])/g, `<span class="hl-paren">$1</span>`);

            return `<div class="hl-line">${html || '&nbsp;'}</div>`;
        }).join('');
    }

    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
