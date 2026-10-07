/**
 * CodeEditor — CodeMirror 6 based DSL editor.
 *
 * Replaces the previous textarea overlay: real undo history, incremental
 * parsing, autocomplete for @keywords, inline compile diagnostics and a
 * theme-aware presentation driven by CSS custom properties.
 */
import { basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
    EditorView,
    keymap,
    Decoration,
    DecorationSet,
} from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { tags } from '@lezer/highlight';

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

const dslLanguage = StreamLanguage.define({
    name: 'circuitsim',
    token(stream) {
        if (stream.match('//')) {
            stream.skipToEnd();
            return 'comment';
        }
        if (stream.match(/@[A-Za-z_][A-Za-z0-9_]*/)) {
            return 'keyword';
        }
        if (stream.match('->')) {
            return 'operator';
        }
        if (stream.match(/\d+(?:\.\d+)?[A-Za-z%]*/)) {
            return 'number';
        }
        if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
            const word = stream.current();
            return DSL_KEYWORDS.includes(word) ? 'keyword' : 'variableName';
        }
        if (stream.match(/[()]/)) {
            return 'bracket';
        }
        if (stream.match(',')) {
            return 'punctuation';
        }
        stream.next();
        return null;
    },
});

const dslHighlight = HighlightStyle.define([
    { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '500' },
    { tag: tags.number, color: 'var(--syntax-number)' },
    { tag: tags.operator, color: 'var(--syntax-arrow)', fontWeight: '600' },
    { tag: tags.bracket, color: 'var(--syntax-paren)' },
    { tag: tags.punctuation, color: 'var(--syntax-paren)' },
    { tag: tags.variableName, color: 'var(--syntax-component)' },
]);

const editorTheme = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--text-primary)',
    },
    '.cm-content': {
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Consolas', 'Monaco', monospace",
        caretColor: 'var(--accent)',
        padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '.cm-gutters': {
        backgroundColor: 'var(--editor-gutter)',
        color: 'var(--text-tertiary)',
        border: 'none',
        borderRight: '1px solid var(--border-secondary)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--editor-line-hl)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--editor-line-hl)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--accent-muted)',
    },
    '.cm-tooltip': {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-primary)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--accent-muted)',
        color: 'var(--text-primary)',
    },
});

function dslCompletions(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/@?[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const options = [
        ...DSL_COMPONENT_TYPES.map(type => ({ label: `@${type}`, type: 'keyword' })),
        ...DSL_KEYWORDS.map(keyword => ({ label: keyword, type: 'keyword' })),
    ];
    return { from: word.from, options, validFor: /^@?[A-Za-z_][A-Za-z0-9_]*$/ };
}

// Error-line highlight controlled by a state effect.
const setErrorLineEffect = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setErrorLineEffect)) {
                if (effect.value === null || effect.value < 1 || effect.value > tr.state.doc.lines) {
                    return Decoration.none;
                }
                const line = tr.state.doc.line(effect.value);
                return Decoration.set([
                    Decoration.line({ class: 'cm-errorLine' }).range(line.from),
                ]);
            }
        }
        return decorations.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});

export class CodeEditor {
    private container: HTMLElement;
    private view: EditorView;
    private onCompile: (() => void) | null = null;
    private onChange: (() => void) | null = null;
    private onCursorChange: ((line: number, col: number) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.classList.add('code-editor-wrapper');
        this.container.innerHTML = '';

        const state = EditorState.create({
            doc: '',
            extensions: [
                basicSetup,
                keymap.of([
                    {
                        key: 'Mod-Enter',
                        run: () => {
                            this.onCompile?.();
                            return true;
                        },
                    },
                    indentWithTab,
                ]),
                dslLanguage,
                syntaxHighlighting(dslHighlight),
                autocompletion({ override: [dslCompletions] }),
                editorTheme,
                errorLineField,
                EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        this.onChange?.();
                    }
                    if (update.selectionSet || update.docChanged) {
                        const head = update.state.selection.main.head;
                        const line = update.state.doc.lineAt(head);
                        this.onCursorChange?.(line.number, head - line.from + 1);
                    }
                }),
            ],
        });

        this.view = new EditorView({ state, parent: this.container });
    }

    get value(): string {
        return this.view.state.doc.toString();
    }

    set value(code: string) {
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: code },
        });
    }

    get cursorLine(): number {
        const head = this.view.state.selection.main.head;
        return this.view.state.doc.lineAt(head).number;
    }

    get cursorCol(): number {
        const head = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(head);
        return head - line.from + 1;
    }

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
        this.view.focus();
    }

    insertText(text: string): void {
        const state = this.view.state;
        const pos = state.selection.main.from;
        const line = state.doc.lineAt(pos);
        const before = state.doc.sliceString(line.from, pos);
        const prefix = before.trim().length > 0 ? '\n' : '';
        const insert = `${prefix}${text}\n`;
        this.view.dispatch({
            changes: { from: pos, insert },
            selection: { anchor: pos + insert.length },
        });
        this.view.focus();
    }

    /** Mark a compile error line and place the cursor on it. */
    setError(line: number, column: number, message: string): void {
        const safeLine = Math.max(1, Math.min(line, this.view.state.doc.lines));
        const lineInfo = this.view.state.doc.line(safeLine);
        const from = lineInfo.from + Math.max(0, Math.min(column - 1, lineInfo.length));
        this.view.dispatch(
            setDiagnostics(this.view.state, [
                { from, to: Math.min(from + 1, lineInfo.to), severity: 'error', message },
            ]),
            { effects: setErrorLineEffect.of(safeLine) },
            { selection: { anchor: from } },
            { scrollIntoView: true },
        );
        this.view.focus();
    }

    clearError(): void {
        this.view.dispatch(
            setDiagnostics(this.view.state, []),
            { effects: setErrorLineEffect.of(null) },
        );
    }
}
