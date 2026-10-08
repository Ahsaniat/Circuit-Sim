/**
 * ComponentLibrary — Categorized component palette with search, working
 * collapse-all, click-to-insert and drag-to-canvas.
 *
 * Category icons come from Tabler Icons (MIT): https://tabler.io/icons
 */
import cpuIcon from '@tabler/icons/outline/cpu.svg?raw';
import waveSineIcon from '@tabler/icons/outline/wave-sine.svg?raw';
import binaryIcon from '@tabler/icons/outline/binary.svg?raw';
import layoutGridIcon from '@tabler/icons/outline/layout-grid.svg?raw';
import resistorIcon from '@tabler/icons/outline/circuit-resistor.svg?raw';
import diodeIcon from '@tabler/icons/outline/circuit-diode.svg?raw';
import changeoverIcon from '@tabler/icons/outline/circuit-changeover.svg?raw';
import switchIcon from '@tabler/icons/outline/circuit-switch-open.svg?raw';
import speakerIcon from '@tabler/icons/outline/device-speaker.svg?raw';
import motorIcon from '@tabler/icons/outline/circuit-motor.svg?raw';
import brightnessIcon from '@tabler/icons/outline/brightness.svg?raw';
import gridDotsIcon from '@tabler/icons/outline/grid-dots.svg?raw';

const CATEGORY_ICONS: Record<string, string> = {
    'Logic ICs': cpuIcon,
    'Timers & Op-Amps': waveSineIcon,
    'Flip-Flops & Counters': binaryIcon,
    'Decoders & Mux': layoutGridIcon,
    'Passive': resistorIcon,
    'Diodes & LEDs': diodeIcon,
    'Transistors': changeoverIcon,
    'Switches': switchIcon,
    'Displays & Audio': speakerIcon,
    'Motors & Power': motorIcon,
    'Sensors': brightnessIcon,
    'Board': gridDotsIcon,
};

interface ComponentEntry {
    keyword: string;
    label: string;
    description: string;
    example: string;
}

interface ComponentCategory {
    name: string;
    icon: string;
    entries: ComponentEntry[];
}

export const COMPONENT_CATEGORIES: ComponentCategory[] = [
    {
        name: 'Logic ICs',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="10" rx="1"/></svg>',
        entries: [
            { keyword: 'AND', label: 'AND Gate (7408)', description: 'Quad 2-input AND', example: '@AND A1 7408' },
            { keyword: 'OR', label: 'OR Gate (7432)', description: 'Quad 2-input OR', example: '@OR O1 7432' },
            { keyword: 'NOT', label: 'NOT Gate (7404)', description: 'Hex inverter', example: '@NOT N1 7404' },
            { keyword: 'NAND', label: 'NAND Gate (7400)', description: 'Quad 2-input NAND', example: '@NAND NA1 7400' },
            { keyword: 'NOR', label: 'NOR Gate (7402)', description: 'Quad 2-input NOR', example: '@NOR NR1 7402' },
            { keyword: 'XOR', label: 'XOR Gate (7486)', description: 'Quad 2-input XOR', example: '@XOR X1 7486' },
            { keyword: 'NAND3', label: '3-Input NAND (7410)', description: 'Triple 3-input NAND', example: '@NAND3 NA3 7410' },
            { keyword: 'AND4', label: '4-Input AND (7421)', description: 'Dual 4-input AND', example: '@AND4 A4 7421' },
            { keyword: 'comp', label: 'Schmitt Inverter (74HC14)', description: 'Hex Schmitt inverter', example: '@comp U1 74HC14' },
            { keyword: 'comp', label: 'Schmitt NAND (74HC132)', description: 'Quad Schmitt NAND', example: '@comp U1 74HC132' },
        ],
    },
    {
        name: 'Timers & Op-Amps',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75v3.5l2.35 2.35a.75.75 0 01-1.06 1.06l-2.5-2.5A.75.75 0 017.25 8.5V4.75a.75.75 0 011.5 0z"/></svg>',
        entries: [
            { keyword: 'comp', label: '555 Timer', description: '8-pin timer IC', example: '@comp T1 555' },
            { keyword: 'comp', label: '556 Dual Timer', description: '14-pin dual timer', example: '@comp T1 556' },
            { keyword: 'comp', label: 'LM741 Op-Amp', description: 'Single op-amp', example: '@comp OA1 LM741' },
            { keyword: 'comp', label: 'LM358 Op-Amp', description: 'Dual op-amp', example: '@comp OA1 LM358' },
            { keyword: 'comp', label: 'LM393 Comparator', description: 'Dual comparator', example: '@comp CMP1 LM393' },
            { keyword: 'comp', label: 'LM339 Comparator', description: 'Quad comparator', example: '@comp CMP1 LM339' },
        ],
    },
    {
        name: 'Flip-Flops & Counters',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v10H1V3zm1 1v8h12V4H2zm2 1h3v2H4V5zm5 0h3v2H9V5z"/></svg>',
        entries: [
            { keyword: 'd_flipflop', label: 'D Flip-Flop (7474)', description: 'Dual D-type', example: '@d_flipflop FF1 7474' },
            { keyword: 'jk_flipflop', label: 'JK Flip-Flop (7476)', description: 'Dual JK-type', example: '@jk_flipflop JK1 7476' },
            { keyword: 'counter_4bit', label: '4-bit Counter (74161)', description: 'Sync binary counter', example: '@counter_4bit C1 74161' },
            { keyword: 'counter_decade', label: 'Decade Counter (7490)', description: 'BCD counter', example: '@counter_decade C1 7490' },
            { keyword: 'comp', label: 'Shift Register (74HC595)', description: '8-bit shift register with latch', example: '@comp U1 74HC595' },
            { keyword: 'comp', label: 'Decade Counter (74HC4017)', description: 'Counter / decoder', example: '@comp U1 74HC4017' },
            { keyword: 'latch_8', label: '8-bit Latch (74373)', description: 'Octal D-latch', example: '@latch_8 L1 74373' },
        ],
    },
    {
        name: 'Decoders & Mux',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z"/></svg>',
        entries: [
            { keyword: 'decoder_3to8', label: '3-to-8 Decoder (74138)', description: 'Line decoder', example: '@decoder_3to8 D1 74138' },
            { keyword: 'decoder_2to4', label: '2-to-4 Decoder (74139)', description: 'Dual decoder', example: '@decoder_2to4 D1 74139' },
            { keyword: 'comp', label: 'BCD-to-7seg (CD4511)', description: 'Display driver', example: '@comp U1 CD4511' },
            { keyword: 'comp', label: 'I2C I/O Expander (PCF8574)', description: '8-bit I/O expander', example: '@comp U1 PCF8574' },
            { keyword: 'mux_8x1', label: '8-to-1 Mux (74151)', description: 'Data selector', example: '@mux_8x1 M1 74151' },
            { keyword: 'mux_4x1', label: '4-to-1 Mux (74153)', description: 'Dual selector', example: '@mux_4x1 M1 74153' },
            { keyword: 'shift_reg_8', label: 'Shift Register (74164)', description: '8-bit serial-in', example: '@shift_reg_8 SR1 74164' },
        ],
    },
    {
        name: 'Passive',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 8h3l1-3 2 6 2-6 1 3h5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
        entries: [
            { keyword: 'resistor', label: 'Resistor', description: '2-pin resistor', example: '@resistor R1 10k' },
            { keyword: 'capacitor', label: 'Capacitor', description: '2-pin capacitor', example: '@capacitor C1 100uF' },
            { keyword: 'inductor', label: 'Inductor', description: '2-pin inductor', example: '@inductor L1 10mH' },
            { keyword: 'potentiometer', label: 'Potentiometer', description: '3-pin variable resistor', example: '@potentiometer P1 10k' },
        ],
    },
    {
        name: 'Diodes & LEDs',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 8l5-4v8L4 8zm6-4v8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
        entries: [
            { keyword: 'diode', label: 'Diode', description: 'Standard rectifier', example: '@diode D1 1N4148' },
            { keyword: 'zener_diode', label: 'Zener Diode', description: 'Voltage reference', example: '@zener_diode Z1 5V1' },
            { keyword: 'led', label: 'LED', description: 'Light-emitting diode', example: '@led LED1 red' },
            { keyword: 'ir_led', label: 'IR LED', description: 'Infrared LED', example: '@ir_led IR1 940nm' },
            { keyword: 'photodiode', label: 'Photodiode', description: 'Light sensor', example: '@photodiode PD1 BPW34' },
        ],
    },
    {
        name: 'Transistors',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5v6M5 8h4l2-3M9 8l2 3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
        entries: [
            { keyword: 'npn', label: 'NPN Transistor', description: 'TO-92 NPN BJT', example: '@npn Q1 2N2222' },
            { keyword: 'pnp', label: 'PNP Transistor', description: 'TO-92 PNP BJT', example: '@pnp Q1 2N3906' },
            { keyword: 'nmos', label: 'N-Channel MOSFET', description: 'N-Ch enhancement', example: '@nmos M1 2N7000' },
            { keyword: 'pmos', label: 'P-Channel MOSFET', description: 'P-Ch enhancement', example: '@pmos M1 IRF9540' },
        ],
    },
    {
        name: 'Switches',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 10h3M11 10h3M5 10l5-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
        entries: [
            { keyword: 'switch_spst', label: 'SPST Switch', description: 'Single-pole single-throw', example: '@switch_spst SW1 SPST' },
            { keyword: 'switch_spdt', label: 'SPDT Switch', description: 'Single-pole double-throw', example: '@switch_spdt SW1 SPDT' },
            { keyword: 'pushbutton', label: 'Push Button', description: 'Momentary tactile switch', example: '@pushbutton BTN1 PUSHBUTTON' },
        ],
    },
    {
        name: 'Displays & Audio',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 5h1v3H6zM9 5h1v3H9zM6 9h4v1H6z" fill="currentColor"/></svg>',
        entries: [
            { keyword: 'display_7seg', label: '7-Segment Display', description: '10-pin display', example: '@display_7seg DSP1 7SEG' },
            { keyword: 'buzzer', label: 'Active Buzzer', description: 'Piezo buzzer', example: '@buzzer BZ1 ACTIVE' },
            { keyword: 'passive_buzzer', label: 'Passive Buzzer', description: 'Tone generator', example: '@passive_buzzer BZ1 PASSIVE' },
        ],
    },
    {
        name: 'Motors & Power',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 4h4v2H3zM9 4h4v2H9zM5 8h6v4H5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
        entries: [
            { keyword: 'motor_dc', label: 'DC Motor', description: '2-pin DC motor', example: '@motor_dc M1 DC' },
            { keyword: 'servo', label: 'Servo Motor', description: '3-pin servo', example: '@servo S1 SERVO' },
            { keyword: 'battery', label: '9V Battery', description: 'Power source', example: '@battery BAT1 9V' },
            { keyword: 'regulator', label: 'Voltage Regulator', description: 'LM7805 5V reg', example: '@regulator VR1 LM7805' },
            { keyword: 'crystal', label: 'Crystal Oscillator', description: '2-pin crystal', example: '@crystal Y1 16MHz' },
        ],
    },
    {
        name: 'Sensors',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1 8h2M13 8h2M8 1v2M8 13v2" stroke="currentColor" stroke-width="1" fill="none"/></svg>',
        entries: [
            { keyword: 'ldr', label: 'LDR (Light Sensor)', description: 'Photoresistor', example: '@ldr LDR1 GL5528' },
        ],
    },
    {
        name: 'Board',
        icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="4" cy="7" r="0.8"/><circle cx="6" cy="7" r="0.8"/><circle cx="8" cy="7" r="0.8"/><circle cx="10" cy="7" r="0.8"/><circle cx="12" cy="7" r="0.8"/></svg>',
        entries: [
            { keyword: 'board', label: 'Breadboard 830', description: '830-point breadboard', example: '@board B1 breadboard_830' },
        ],
    },
];

/**
 * Pure filter used by the palette search. Matches against label,
 * description, keyword and example, case-insensitively.
 */
export function filterCategories(categories: ComponentCategory[], query: string): ComponentCategory[] {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
        .map(category => ({
            ...category,
            entries: category.entries.filter(entry =>
                entry.label.toLowerCase().includes(q) ||
                entry.description.toLowerCase().includes(q) ||
                entry.keyword.toLowerCase().includes(q) ||
                entry.example.toLowerCase().includes(q)
            ),
        }))
        .filter(category => category.entries.length > 0);
}

/**
 * Collect every declared identifier in the DSL source: component/board
 * instance ids and custom IC names.
 */
export function collectUsedIds(code: string): Set<string> {
    const ids = new Set<string>();
    const declaration = /^\s*@\w+\s+([A-Za-z_]\w*)/gm;
    const icDef = /^\s*def\s+([A-Za-z_]\w*)/gm;
    for (const match of code.matchAll(declaration)) {
        ids.add(match[1]);
    }
    for (const match of code.matchAll(icDef)) {
        ids.add(match[1]);
    }
    return ids;
}

/**
 * Rename the instance id in an example declaration if it is already used,
 * so inserting from the palette never creates a duplicate declaration.
 * `@board B1 breadboard_830` becomes `@board B2 breadboard_830`.
 */
export function makeUniqueId(example: string, usedIds: Set<string>): string {
    const match = example.match(/^(@\w+\s+)([A-Za-z_]\w*)(.*)$/);
    if (!match) return example;
    const [, prefix, id, rest] = match;
    if (!usedIds.has(id)) return example;

    const numbered = id.match(/^(.*?)(\d+)$/);
    const base = numbered ? numbered[1] : id;
    let counter = numbered ? parseInt(numbered[2], 10) : 1;
    let candidate: string;
    do {
        counter += 1;
        candidate = `${base}${counter}`;
    } while (usedIds.has(candidate));
    return `${prefix}${candidate}${rest}`;
}

export class ComponentLibrary {
    private container: HTMLElement;
    private onInsert: ((code: string) => void) | null = null;
    private expandedCategories: Set<string> = new Set();
    private query = '';

    constructor(container: HTMLElement) {
        this.container = container;
        this.render();
    }

    setOnInsert(fn: (code: string) => void): void {
        this.onInsert = fn;
    }

    private render(): void {
        this.container.innerHTML = '';
        this.container.className = 'component-library';

        const header = document.createElement('div');
        header.className = 'comp-lib-header';

        const title = document.createElement('span');
        title.className = 'comp-lib-title';
        title.textContent = 'Components';
        header.appendChild(title);

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'comp-lib-search';
        search.placeholder = 'Search…';
        search.setAttribute('aria-label', 'Search components');
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.renderList(list);
        });
        header.appendChild(search);

        const toggle = document.createElement('button');
        toggle.className = 'comp-lib-toggle';
        const allExpanded = COMPONENT_CATEGORIES.every(c => this.expandedCategories.has(c.name));
        toggle.title = allExpanded ? 'Collapse all' : 'Expand all';
        toggle.setAttribute('aria-label', toggle.title);
        toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/></svg>';
        toggle.addEventListener('click', () => {
            if (allExpanded) {
                this.expandedCategories.clear();
            } else {
                for (const category of COMPONENT_CATEGORIES) {
                    this.expandedCategories.add(category.name);
                }
            }
            this.render();
        });
        header.appendChild(toggle);

        this.container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'comp-lib-list';
        this.container.appendChild(list);
        this.renderList(list);
    }

    private renderList(list: HTMLElement): void {
        list.innerHTML = '';
        const categories = filterCategories(COMPONENT_CATEGORIES, this.query);
        if (categories.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'comp-lib-empty';
            empty.textContent = `No components match "${this.query}"`;
            list.appendChild(empty);
            return;
        }
        const searching = this.query.trim().length > 0;
        for (const category of categories) {
            list.appendChild(this.createCategory(category, searching));
        }
    }

    private createCategory(category: ComponentCategory, forceExpanded: boolean): HTMLElement {
        const el = document.createElement('div');
        el.className = 'comp-lib-category';

        const isExpanded = forceExpanded || this.expandedCategories.has(category.name);

        const headerBtn = document.createElement('button');
        headerBtn.className = `comp-lib-cat-header${isExpanded ? ' expanded' : ''}`;
        const icon = CATEGORY_ICONS[category.name] ?? category.icon;
        headerBtn.innerHTML = `
            <span class="comp-lib-cat-icon">${icon}</span>
            <span class="comp-lib-cat-name">${category.name}</span>
            <span class="comp-lib-cat-count">${category.entries.length}</span>
            <span class="comp-lib-cat-arrow">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>
            </span>
        `;

        const items = document.createElement('div');
        items.className = `comp-lib-items${isExpanded ? ' expanded' : ''}`;

        for (const entry of category.entries) {
            const item = document.createElement('button');
            item.className = 'comp-lib-item';
            item.innerHTML = `
                <span class="comp-lib-item-label">${entry.label}</span>
                <span class="comp-lib-item-desc">${entry.description}</span>
            `;
            item.title = `Click or drag to insert: ${entry.example}`;
            item.draggable = true;
            item.addEventListener('click', () => {
                this.onInsert?.(entry.example);
            });
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', entry.example);
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'copy';
                }
            });
            items.appendChild(item);
        }

        headerBtn.addEventListener('click', () => {
            if (this.expandedCategories.has(category.name)) {
                this.expandedCategories.delete(category.name);
            } else {
                this.expandedCategories.add(category.name);
            }
            items.classList.toggle('expanded');
            headerBtn.classList.toggle('expanded');
        });

        el.appendChild(headerBtn);
        el.appendChild(items);
        return el;
    }
}
