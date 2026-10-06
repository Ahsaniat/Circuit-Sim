/**
 * Templates — Pre-built circuit examples for quick onboarding
 */

export interface CircuitTemplate {
    name: string;
    description: string;
    code: string;
}

export const CIRCUIT_TEMPLATES: CircuitTemplate[] = [
    {
        name: 'LED with Resistor',
        description: 'Basic LED circuit with current-limiting resistor',
        code: `// Basic LED Circuit
@resistor R1 330
@led LED1 red
@board B1 breadboard_830

map (
    (R1 pin 2 -> LED1 pin 1)
)`,
    },
    {
        name: 'Logic Gates',
        description: 'AND and OR gates connected together',
        code: `// Logic Gates Demo
@AND A1 7408
@OR O1 7432
@resistor R1 330
@led LED1 red
@board B1 breadboard_830

map (
    (A1 pin 3 -> O1 pin 1)
    (A1 pin 6 -> O1 pin 2)
    (O1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
)`,
    },
    {
        name: 'NPN Transistor Switch',
        description: 'Transistor as a digital switch for LED',
        code: `// Transistor Switch
@npn Q1 2N2222
@resistor R1 1k
@resistor R2 330
@led LED1 green
@board B1 breadboard_830

map (
    (R1 pin 2 -> Q1 pin 2)
    (R2 pin 2 -> LED1 pin 1)
)`,
    },
    {
        name: '555 Timer Oscillator',
        description: 'Astable 555 timer generating square wave',
        code: `// 555 Timer Astable Mode
@comp T1 555
@resistor R1 10k
@resistor R2 47k
@capacitor C1 10uF
@led LED1 red
@board B1 breadboard_830

map (
    (T1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
    (T1 pin 7 -> R2 pin 1)
    (R2 pin 2 -> T1 pin 6)
)`,
    },
    {
        name: 'Counter with Display',
        description: 'Decade counter driving a 7-segment display',
        code: `// Counter + 7-Segment Display
@counter_decade CNT1 7490
@comp DEC1 7447
@display_7seg DSP1 7SEG
@board B1 breadboard_830

map (
    (CNT1 pin 12 -> DEC1 pin 7)
    (CNT1 pin 9 -> DEC1 pin 1)
    (CNT1 pin 8 -> DEC1 pin 2)
    (CNT1 pin 11 -> DEC1 pin 6)
    (DEC1 pin 13 -> DSP1 pin 1)
    (DEC1 pin 12 -> DSP1 pin 2)
)`,
    },
    {
        name: 'Motor Driver',
        description: 'DC motor driven by transistor with pushbutton',
        code: `// DC Motor Driver
@pushbutton BTN1 PUSHBUTTON
@npn Q1 2N2222
@resistor R1 1k
@diode D1 1N4148
@motor_dc M1 DC
@board B1 breadboard_830

map (
    (BTN1 pin 1 -> R1 pin 1)
    (R1 pin 2 -> Q1 pin 2)
)`,
    },
    {
        name: 'Voltage Regulator',
        description: '9V battery with LM7805 5V regulator',
        code: `// Voltage Regulator Circuit
@battery BAT1 9V
@regulator VR1 LM7805
@capacitor C1 100uF
@capacitor C2 10uF
@led LED1 green
@resistor R1 330
@board B1 breadboard_830

map (
    (BAT1 pin 1 -> VR1 pin 1)
    (VR1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
)`,
    },
    {
        name: 'Op-Amp Comparator',
        description: 'LM741 as voltage comparator with LDR sensor',
        code: `// Op-Amp Comparator
@comp OA1 LM741
@ldr LDR1 GL5528
@resistor R1 10k
@resistor R2 10k
@resistor R3 330
@led LED1 red
@board B1 breadboard_830

map (
    (LDR1 pin 2 -> OA1 pin 2)
    (R1 pin 2 -> OA1 pin 3)
    (OA1 pin 6 -> R3 pin 1)
    (R3 pin 2 -> LED1 pin 1)
)`,
    },
    {
        name: 'Shift Register LED Bar',
        description: '74164 shift register driving multiple LEDs',
        code: `// Shift Register LED Bar
@shift_reg_8 SR1 74164
@resistor R1 330
@resistor R2 330
@resistor R3 330
@led LED1 red
@led LED2 green
@led LED3 blue
@board B1 breadboard_830

map (
    (SR1 pin 3 -> R1 pin 1)
    (SR1 pin 4 -> R2 pin 1)
    (SR1 pin 5 -> R3 pin 1)
    (R1 pin 2 -> LED1 pin 1)
    (R2 pin 2 -> LED2 pin 1)
    (R3 pin 2 -> LED3 pin 1)
)`,
    },
    {
        name: 'Crystal Oscillator',
        description: 'Crystal oscillator with NAND gates',
        code: `// Crystal Oscillator
@NAND NA1 7400
@crystal Y1 16MHz
@capacitor C1 22pF
@capacitor C2 22pF
@resistor R1 1M
@board B1 breadboard_830

map (
    (NA1 pin 3 -> Y1 pin 1)
    (Y1 pin 2 -> NA1 pin 1)
    (NA1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> NA1 pin 1)
)`,
    },
];

export class Templates {
    private dropdown: HTMLElement;
    private menu: HTMLElement | null = null;
    private isOpen = false;
    private onSelect: ((code: string) => void) | null = null;

    constructor(triggerBtn: HTMLElement) {
        this.dropdown = triggerBtn;
        this.dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        document.addEventListener('click', () => this.close());
    }

    setOnSelect(fn: (code: string) => void): void {
        this.onSelect = fn;
    }

    private toggle(): void {
        this.isOpen ? this.close() : this.open();
    }

    private open(): void {
        if (this.menu) this.menu.remove();

        this.menu = document.createElement('div');
        this.menu.className = 'templates-dropdown';

        const header = document.createElement('div');
        header.className = 'templates-dropdown-header';
        header.textContent = 'Circuit Templates';
        this.menu.appendChild(header);

        for (const template of CIRCUIT_TEMPLATES) {
            const item = document.createElement('button');
            item.className = 'templates-dropdown-item';
            item.innerHTML = `
                <span class="templates-item-name">${template.name}</span>
                <span class="templates-item-desc">${template.description}</span>
            `;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onSelect?.(template.code);
                this.close();
            });
            this.menu.appendChild(item);
        }

        // Position below button
        const rect = this.dropdown.getBoundingClientRect();
        this.menu.style.top = `${rect.bottom + 4}px`;
        this.menu.style.left = `${rect.left}px`;

        document.body.appendChild(this.menu);
        this.isOpen = true;
    }

    private close(): void {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        this.isOpen = false;
    }
}
