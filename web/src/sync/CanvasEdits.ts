/**
 * Canvas-to-code synchronization.
 *
 * Structural canvas edits (added parts, removed parts, rewired connections)
 * are buffered while the user works. Nothing touches the DSL until the user
 * asks for it, at which point the buffered edits are patched into the source
 * text. The patcher is deliberately conservative: when it cannot apply an
 * edit safely it reports a reason and leaves the edit pending instead of
 * guessing.
 */

export interface Endpoint {
    component: string;
    pin: number;
}

export type CanvasEdit =
    | { kind: 'add'; id: string; declaration: string }
    | { kind: 'remove'; id: string }
    | { kind: 'connect'; from: Endpoint; to: Endpoint }
    | { kind: 'disconnect'; from: Endpoint; to: Endpoint }
    | { kind: 'rewire'; oldFrom: Endpoint; oldTo: Endpoint; newFrom: Endpoint; newTo: Endpoint };

export interface ApplyResult {
    code: string;
    applied: CanvasEdit[];
    failed: Array<{ edit: CanvasEdit; reason: string }>;
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
    return a.component === b.component && a.pin === b.pin;
}

/** The same electrical connection, regardless of which end is written first. */
function isSameConnection(entryFrom: Endpoint, entryTo: Endpoint, from: Endpoint, to: Endpoint): boolean {
    return (sameEndpoint(entryFrom, from) && sameEndpoint(entryTo, to)) ||
        (sameEndpoint(entryFrom, to) && sameEndpoint(entryTo, from));
}

const DECLARATION = /^[ \t]*@([A-Za-z_]\w*)[ \t]+([A-Za-z_]\w*)/;

function formatPair(from: Endpoint, to: Endpoint): string {
    return `(${from.component} pin ${from.pin} -> ${to.component} pin ${to.pin})`;
}

interface MapEntry {
    /** Index of the opening '(' in the source. */
    start: number;
    /** Index just after the closing ')'. */
    end: number;
    source: Endpoint;
    destinations: Endpoint[];
}

interface MapBlock {
    /** Index of the '(' that opens the block. */
    openParen: number;
    /** Index of the ')' that closes the block. */
    closeParen: number;
    entries: MapEntry[];
}

/** True when `index` sits inside a `//` line comment. */
function inLineComment(source: string, index: number): boolean {
    const lineStart = source.lastIndexOf('\n', index - 1) + 1;
    const comment = source.indexOf('//', lineStart);
    return comment !== -1 && comment < index;
}

function parseEndpoint(text: string): Endpoint | null {
    const match = text.trim().match(/^([A-Za-z_]\w*)[ \t]+pin[ \t]+(\d+)$/);
    if (!match) return null;
    return { component: match[1], pin: parseInt(match[2], 10) };
}

/** Parse one `( src -> dst, dst )` entry body (without the outer parens). */
function parseEntryBody(body: string): { source: Endpoint; destinations: Endpoint[] } | null {
    const arrow = body.indexOf('->');
    if (arrow === -1) return null;
    const source = parseEndpoint(body.slice(0, arrow));
    if (!source) return null;
    const destinations: Endpoint[] = [];
    for (const part of body.slice(arrow + 2).split(',')) {
        const destination = parseEndpoint(part);
        if (!destination) return null;
        destinations.push(destination);
    }
    if (destinations.length === 0) return null;
    return { source, destinations };
}

function findMapBlocks(source: string): MapBlock[] {
    const blocks: MapBlock[] = [];
    const marker = /\bmap[ \t]*\(/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(source)) !== null) {
        if (inLineComment(source, match.index)) continue;
        const openParen = match.index + match[0].length - 1;
        let depth = 0;
        let closeParen = -1;
        for (let i = openParen; i < source.length; i++) {
            const ch = source[i];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    closeParen = i;
                    break;
                }
            }
        }
        if (closeParen === -1) continue;

        const entries: MapEntry[] = [];
        let i = openParen + 1;
        while (i < closeParen) {
            if (source[i] === '(') {
                let entryDepth = 0;
                let entryEnd = -1;
                for (let j = i; j < closeParen; j++) {
                    if (source[j] === '(') entryDepth++;
                    else if (source[j] === ')') {
                        entryDepth--;
                        if (entryDepth === 0) {
                            entryEnd = j;
                            break;
                        }
                    }
                }
                if (entryEnd === -1) break;
                const parsed = parseEntryBody(source.slice(i + 1, entryEnd));
                if (parsed) {
                    entries.push({ start: i, end: entryEnd + 1, source: parsed.source, destinations: parsed.destinations });
                }
                i = entryEnd + 1;
            } else {
                i++;
            }
        }
        blocks.push({ openParen, closeParen, entries });
        marker.lastIndex = closeParen + 1;
    }
    return blocks;
}

/**
 * Splice a whole entry out of the source. When the entry sits alone on its
 * line, the indentation and the line break go with it so no blank line is
 * left behind.
 */
function spliceEntry(source: string, entry: { start: number; end: number }): string {
    let start = entry.start;
    let end = entry.end;
    const lineStart = source.lastIndexOf('\n', start) + 1;
    if (/^[ \t]*$/.test(source.slice(lineStart, start))) {
        start = lineStart;
    }
    const lineEnd = source.indexOf('\n', end);
    if (lineEnd !== -1 && /^[ \t]*$/.test(source.slice(end, lineEnd))) {
        end = lineEnd + 1;
    }
    return source.slice(0, start) + source.slice(end);
}

/** Remove one destination (or the whole entry when it was the only one). */
function removeConnection(source: string, from: Endpoint, to: Endpoint): { code: string } | { reason: string } {
    for (const block of findMapBlocks(source)) {
        for (const entry of block.entries) {
            // Connections are electrically undirected; try both spellings.
            for (const [entryFrom, entryTo] of [[from, to], [to, from]] as const) {
                const index = sameEndpoint(entry.source, entryFrom)
                    ? entry.destinations.findIndex(destination => sameEndpoint(destination, entryTo))
                    : -1;
                if (index === -1) continue;
                if (entry.destinations.length === 1) {
                    return { code: spliceEntry(source, entry) };
                }
                const kept = entry.destinations.filter((_, i) => i !== index);
                const replacement = `(${entry.source.component} pin ${entry.source.pin} -> ${kept
                    .map(destination => `${destination.component} pin ${destination.pin}`)
                    .join(', ')})`;
                return { code: source.slice(0, entry.start) + replacement + source.slice(entry.end) };
            }
        }
    }
    return { reason: `connection ${formatPair(from, to)} not found in the map blocks` };
}

function connectionExists(source: string, from: Endpoint, to: Endpoint): boolean {
    for (const block of findMapBlocks(source)) {
        for (const entry of block.entries) {
            for (const destination of entry.destinations) {
                if (isSameConnection(entry.source, destination, from, to)) return true;
            }
        }
    }
    return false;
}

function insertConnection(source: string, from: Endpoint, to: Endpoint): string {
    const blocks = findMapBlocks(source);
    const line = formatPair(from, to);
    if (blocks.length > 0) {
        const block = blocks[0];
        return `${source.slice(0, block.closeParen)}    ${line}\n${source.slice(block.closeParen)}`;
    }
    const trimmed = source.replace(/\s+$/, '');
    return `${trimmed}\n\nmap (\n    ${line}\n)\n`;
}

function removeDeclaration(source: string, id: string): { code: string } | { reason: string } {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const match = DECLARATION.exec(lines[i]);
        if (!match || match[2] !== id) continue;
        const rest = lines[i].slice(match[0].length);
        if (rest.includes('@')) {
            return { reason: `declaration of '${id}' shares a line with another statement` };
        }
        lines.splice(i, 1);
        return { code: lines.join('\n') };
    }
    return { reason: `declaration of '${id}' not found` };
}

function malformedEntryMentions(source: string, edit: CanvasEdit): boolean {
    const ids = edit.kind === 'remove'
        ? [edit.id]
        : edit.kind === 'disconnect' || edit.kind === 'connect'
            ? [edit.from.component, edit.to.component]
            : edit.kind === 'rewire'
                ? [edit.oldFrom.component, edit.oldTo.component, edit.newFrom.component, edit.newTo.component]
                : [edit.id];
    for (const block of findMapBlocks(source)) {
        // Entries that failed to parse are re-scanned textually.
        const inner = source.slice(block.openParen + 1, block.closeParen);
        for (const chunk of inner.split('(').slice(1)) {
            const body = chunk.split(')')[0];
            if (!parseEntryBody(body)) {
                if (ids.some(id => new RegExp(`\\b${id}\\b`).test(body))) return true;
            }
        }
    }
    return false;
}

function applyOne(source: string, edit: CanvasEdit): { code: string } | { reason: string } {
    switch (edit.kind) {
        case 'add': {
            if (!/^@\w+[ \t]+[A-Za-z_]\w*/.test(edit.declaration)) {
                return { reason: `'${edit.declaration}' is not a component declaration` };
            }
            const declaration = edit.declaration.trim();
            // Keep declarations together: insert after the last one instead
            // of appending past the map blocks.
            const lines = source.split('\n');
            let lastDeclaration = -1;
            for (let i = 0; i < lines.length; i++) {
                if (/^[ \t]*@\w+[ \t]+[A-Za-z_]\w*/.test(lines[i])) lastDeclaration = i;
            }
            if (lastDeclaration >= 0) {
                lines.splice(lastDeclaration + 1, 0, declaration);
                return { code: lines.join('\n') };
            }
            const trimmed = source.replace(/\s+$/, '');
            return { code: `${trimmed}\n${declaration}\n` };
        }
        case 'remove': {
            if (malformedEntryMentions(source, edit)) {
                return { reason: `'${edit.id}' appears in a map entry that cannot be parsed` };
            }
            const declaration = removeDeclaration(source, edit.id);
            if ('reason' in declaration) return declaration;
            let code = declaration.code;
            // Drop every connection the component took part in.
            for (;;) {
                let changed = false;
                for (const block of findMapBlocks(code)) {
                    for (const entry of block.entries) {
                        if (entry.source.component === edit.id && entry.destinations.length > 0) {
                            code = spliceEntry(code, entry);
                            changed = true;
                            break;
                        }
                        const index = entry.destinations.findIndex(d => d.component === edit.id);
                        if (index !== -1) {
                            const result = removeConnection(code, entry.source, entry.destinations[index]);
                            if ('code' in result) code = result.code;
                            changed = true;
                            break;
                        }
                    }
                    if (changed) break;
                }
                if (!changed) break;
            }
            return { code };
        }
        case 'connect': {
            if (!connectionExists(source, edit.from, edit.to) && malformedEntryMentions(source, edit)) {
                return { reason: 'the connection appears in a map entry that cannot be parsed' };
            }
            if (connectionExists(source, edit.from, edit.to)) {
                return { code: source };
            }
            return { code: insertConnection(source, edit.from, edit.to) };
        }
        case 'disconnect': {
            if (malformedEntryMentions(source, edit)) {
                return { reason: 'the connection appears in a map entry that cannot be parsed' };
            }
            return removeConnection(source, edit.from, edit.to);
        }
        case 'rewire': {
            if (malformedEntryMentions(source, edit) && !connectionExists(source, edit.oldFrom, edit.oldTo)) {
                return { reason: 'the old connection appears in a map entry that cannot be parsed' };
            }
            const removed = removeConnection(source, edit.oldFrom, edit.oldTo);
            if ('reason' in removed) return removed;
            if (connectionExists(removed.code, edit.newFrom, edit.newTo)) {
                return { code: removed.code };
            }
            return { code: insertConnection(removed.code, edit.newFrom, edit.newTo) };
        }
    }
}

export function applyCanvasEdits(source: string, edits: CanvasEdit[]): ApplyResult {
    let code = source;
    const applied: CanvasEdit[] = [];
    const failed: ApplyResult['failed'] = [];
    for (const edit of edits) {
        const result = applyOne(code, edit);
        if ('code' in result) {
            code = result.code;
            applied.push(edit);
        } else {
            failed.push({ edit, reason: result.reason });
        }
    }
    return { code, applied, failed };
}

/**
 * Buffer of edits made on the canvas but not yet written to the code.
 * Additions can be cancelled by removing the same part again, and a wire
 * dragged back to its original pin drops the pending rewire entirely.
 */
export class CanvasEditBuffer {
    private edits: CanvasEdit[] = [];

    get count(): number {
        return this.edits.length;
    }

    get all(): CanvasEdit[] {
        return [...this.edits];
    }

    clear(): void {
        this.edits = [];
    }

    restore(edits: CanvasEdit[]): void {
        this.edits = edits.map(edit => ({ ...edit }));
    }

    recordAdd(id: string, declaration: string): void {
        this.edits.push({ kind: 'add', id, declaration });
    }

    recordRemove(id: string): void {
        const wasAdded = this.edits.some(edit => edit.kind === 'add' && edit.id === id);
        // Either way the component is gone from the canvas; drop everything
        // that mentions it. A never-written addition leaves no trace.
        this.dropReferencing(id);
        if (!wasAdded) {
            this.edits.push({ kind: 'remove', id });
        }
    }

    recordConnect(from: Endpoint, to: Endpoint): void {
        // Deleting a connection and drawing the same one again cancels out.
        const disconnect = this.edits.find(edit =>
            edit.kind === 'disconnect' && isSameConnection(edit.from, edit.to, from, to)
        );
        if (disconnect) {
            this.edits = this.edits.filter(edit => edit !== disconnect);
            return;
        }
        // Drawing the original connection back cancels a pending rewire.
        const rewire = this.edits.find(edit =>
            edit.kind === 'rewire' && isSameConnection(edit.oldFrom, edit.oldTo, from, to)
        );
        if (rewire) {
            this.edits = this.edits.filter(edit => edit !== rewire);
            return;
        }
        if (this.edits.some(edit => edit.kind === 'connect' && isSameConnection(edit.from, edit.to, from, to))) {
            return;
        }
        this.edits.push({ kind: 'connect', from, to });
    }

    recordDisconnect(from: Endpoint, to: Endpoint): void {
        // Deleting a wire that was drawn on the canvas and never written
        // simply cancels the pending connect.
        const connect = this.edits.find(edit =>
            edit.kind === 'connect' && isSameConnection(edit.from, edit.to, from, to)
        );
        if (connect) {
            this.edits = this.edits.filter(edit => edit !== connect);
            return;
        }
        // Removing a wire that was rewired earlier must remove the original
        // connection, not the one the user just dragged to.
        const pending = this.edits.find(edit =>
            edit.kind === 'rewire' && isSameConnection(edit.newFrom, edit.newTo, from, to)
        );
        if (pending && pending.kind === 'rewire') {
            this.edits = this.edits.filter(edit => edit !== pending);
            this.edits.push({ kind: 'disconnect', from: pending.oldFrom, to: pending.oldTo });
            return;
        }
        this.edits.push({ kind: 'disconnect', from, to });
    }

    recordRewire(oldFrom: Endpoint, oldTo: Endpoint, newFrom: Endpoint, newTo: Endpoint): void {
        if (sameEndpoint(oldFrom, newFrom) && sameEndpoint(oldTo, newTo)) return;
        // Rewiring a wire that was just drawn converts the pending connect.
        const drawn = this.edits.find(edit =>
            edit.kind === 'connect' && isSameConnection(edit.from, edit.to, oldFrom, oldTo)
        );
        if (drawn) {
            this.edits = this.edits.filter(edit => edit !== drawn);
            this.recordConnect(newFrom, newTo);
            return;
        }
        const pending = this.edits.find(edit =>
            edit.kind === 'rewire' && isSameConnection(edit.newFrom, edit.newTo, oldFrom, oldTo)
        );
        if (pending && pending.kind === 'rewire') {
            if (isSameConnection(pending.oldFrom, pending.oldTo, newFrom, newTo)) {
                // Dragged back to where it started: nothing left to write.
                this.edits = this.edits.filter(edit => edit !== pending);
                return;
            }
            pending.newFrom = newFrom;
            pending.newTo = newTo;
            return;
        }
        this.edits.push({ kind: 'rewire', oldFrom, oldTo, newFrom, newTo });
    }

    private dropReferencing(id: string): void {
        this.edits = this.edits.filter(edit => {
            if (edit.kind === 'add') return edit.id !== id;
            if (edit.kind === 'remove') return edit.id !== id;
            if (edit.kind === 'connect' || edit.kind === 'disconnect') {
                return edit.from.component !== id && edit.to.component !== id;
            }
            return edit.oldFrom.component !== id && edit.oldTo.component !== id &&
                edit.newFrom.component !== id && edit.newTo.component !== id;
        });
    }
}


