/**
 * DJO Dictee
 * Copyright (C) 2026 ngkon
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Arduino circuits: part definitions, validation, and automatic grading by simulation.
// Shared by the server (grading) and the examiner page (checking the model answer).
//
// Grading works in two layers:
//  1. The (fixed) Arduino sketch is translated from a C++ subset to JavaScript and run with a virtual clock.
//  2. Every time the sketch reads a pin, and at the moment a test checks the outputs, the circuit is solved
//     electrically (DC nodal analysis with piecewise linear diodes and transistors).

/**
 * @typedef {{id: string, type: string, value?: number, color?: string}} CircuitPart
 * @typedef {{positions: Record<string, {x: number, y: number, rot: number}>, wires: [string, string][]}} Circuit
 * @typedef {{name: string, at: number, inputs: Record<string, boolean>, expect: Record<string, boolean>}} CircuitTest
 * @typedef {{id: string, task: string, code: string, parts: CircuitPart[], tests: CircuitTest[], solution: Circuit}} CircuitQuestion
 * @typedef {{score: number, tests: {name: string, passed: boolean, message: string}[]}} CircuitGrade
 */

export const NANO = "NANO";
/** Size of the editor canvas, in the units of the Wokwi elements (1 pin pitch = 9.6). */
export const CANVAS = {width: 440, height: 250};

const DIGITAL_PINS = Array.from({length: 12}, (_, i) => `D${i + 2}`);
const ANALOG_PINS = Array.from({length: 6}, (_, i) => `A${i}`);
/** The Nano pins that can be used; GND2 is the second GND pin (connected to GND on the board). */
export const NANO_PINS = [...DIGITAL_PINS, ...ANALOG_PINS, "5V", "GND", "GND2"];

/** Arduino pin number (2-13 digital, 14-19 = A0-A5) to name. */
export const pinName = (n) => n < 14 ? `D${n}` : `A${n - 14}`;

export const PART_TYPES = {
    resistor: {name: "Weerstand", terminals: ["1", "2"], prefix: "R"},
    led: {name: "LED", terminals: ["a", "k"], prefix: "LED", output: true},
    // like a real tactile switch: 1l-1r and 2l-2r are always connected, pressing connects 1 and 2
    button: {name: "Drukknop", terminals: ["1l", "1r", "2l", "2r"], prefix: "S", input: true},
    npn: {name: "NPN-transistor", terminals: ["c", "b", "e"], prefix: "Q"},
    motor: {name: "Motor", terminals: ["1", "2"], prefix: "M", output: true},
    buzzer: {name: "Zoemer", terminals: ["p", "n"], prefix: "BZ", output: true}
};
export const TERMINAL_NAMES = {
    a: "+ (anode, lange poot)", k: "− (kathode, korte poot)",
    c: "C (collector)", b: "B (basis)", e: "E (emitter)",
    p: "+", n: "−", "1": "aansluiting 1", "2": "aansluiting 2",
    "1l": "1 (links)", "1r": "1 (rechts)", "2l": "2 (links)", "2r": "2 (rechts)"
};
/** LED colors with their forward voltage. */
export const LED_COLORS = {rood: 1.8, geel: 2.0, groen: 2.1, blauw: 3.0, wit: 3.0};

const MODE = {INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2};

/** Electrical limits and models. */
const MODEL = {
    pinResistance: 25, // internal resistance of an output pin (Ω)
    pullup: 35000, // internal pull-up (Ω)
    floating: 1e8, // a floating input is pulled weakly to "anything", see `digitalRead`
    pinMaxCurrent: 0.04,
    ledResistance: 15, ledOnCurrent: 0.001, ledMaxCurrent: 0.03,
    buzzerVf: 1.0, buzzerResistance: 180, buzzerOnCurrent: 0.005,
    motorResistance: 50, motorOnCurrent: 0.04,
    beVf: 0.7, beResistance: 50, transistorOnBase: 5e-5, transistorMaxBase: 0.02,
    ceResistance: 2, transistorMaxCurrent: 0.5,
    off: 1e-9 // conductance of anything that does not conduct
};

const formatNumber = (n) => String(+n.toFixed(2)).replace(".", ",");
export const formatOhm = (v) => v >= 1e6 ? `${formatNumber(v / 1e6)} MΩ` : v >= 1000 ? `${formatNumber(v / 1000)} kΩ` : `${formatNumber(v)} Ω`;
const formatMilliAmps = (a) => `${Math.round(Math.abs(a) * 1000)} mA`;

export const partLabel = (p) =>
    p.type === "resistor" ? `${p.id} (${formatOhm(p.value)})` :
    p.type === "led" ? `${p.id} (${p.color})` : p.id;

export const allTerminals = (parts) => [
    ...NANO_PINS.map(p => `${NANO}.${p}`),
    ...parts.flatMap(p => PART_TYPES[p.type]?.terminals.map(t => `${p.id}.${t}`) ?? [])
];


/* ---------- sanitizing & validation ---------- */

/** @returns {Circuit} */
export const emptyCircuit = () => ({positions: {}, wires: []});
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * @param {unknown} input
 * @param {CircuitPart[]} parts
 * @returns {Circuit} a circuit containing only valid positions and wires for the given parts.
 */
export const sanitizeCircuit = (input, parts) => {
    const out = emptyCircuit();
    if (!input || typeof input !== "object") return out;

    const ids = new Set([NANO, ...parts.map(p => p.id)]);
    if (input.positions && typeof input.positions === "object") {
        for (const [id, pos] of Object.entries(input.positions)) {
            if (!ids.has(id) || !pos || typeof pos !== "object") continue;
            const x = Number(pos.x), y = Number(pos.y), rot = Number(pos.rot) || 0;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            out.positions[id] = {x: clamp(x, 0, CANVAS.width), y: clamp(y, 0, CANVAS.height), rot: [0, 90, 180, 270].includes(rot) ? rot : 0};
        }
    }

    const terminals = new Set(allTerminals(parts));
    const seen = new Set();
    for (const w of Array.isArray(input.wires) ? input.wires.slice(0, 300) : []) {
        if (!Array.isArray(w) || !terminals.has(w[0]) || !terminals.has(w[1]) || w[0] === w[1]) continue;
        const key = [w[0], w[1]].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.wires.push([w[0], w[1]]);
    }
    return out;
};

export const newQuestionID = () => Math.random().toString(36).slice(2, 10);

/**
 * Coerce an untrusted question into a valid shape (it can still be invalid, see `validateQuestion`).
 * @param {any} q
 * @returns {CircuitQuestion}
 */
export const sanitizeQuestion = (q) => {
    const parts = [];
    for (const p of Array.isArray(q?.parts) ? q.parts.slice(0, 30) : []) {
        if (!p || !(p.type in PART_TYPES)) continue;
        const part = {id: String(p.id ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8), type: p.type};
        if (p.type === "resistor") part.value = clamp(Number(p.value) || 220, 1, 1e7);
        if (p.type === "led") part.color = (p.color in LED_COLORS) ? p.color : "rood";
        parts.push(part);
    }

    const tests = [];
    for (const t of Array.isArray(q?.tests) ? q.tests.slice(0, 20) : []) {
        if (!t || typeof t !== "object") continue;
        const inputs = {}, expect = {};
        for (const [k, v] of Object.entries(t.inputs ?? {})) if (v === true) inputs[k] = true;
        for (const [k, v] of Object.entries(t.expect ?? {})) if (typeof v === "boolean") expect[k] = v;
        tests.push({
            name: String(t.name ?? "").replaceAll("\n", " ").trim().slice(0, 120),
            at: clamp(Math.round(Number(t.at) || 100), 1, 60000),
            inputs, expect
        });
    }

    return {
        id: typeof q?.id === "string" && q.id ? q.id.slice(0, 32) : newQuestionID(),
        task: String(q?.task ?? "").trim(),
        code: String(q?.code ?? ""),
        parts, tests,
        solution: sanitizeCircuit(q?.solution, parts)
    };
};

/**
 * @param {CircuitQuestion} q
 * @returns {string | null} a (Dutch) problem description, or `null` when the question is fine and its model answer passes all tests.
 */
export const validateQuestion = (q) => {
    if (!q.task) return "er mist een opdracht";

    const ids = new Set();
    for (const p of q.parts) {
        if (!/^[A-Z][A-Z0-9]*$/.test(p.id) || p.id === NANO) return `onderdeel "${p.id}" heeft geen geldige naam`;
        if (ids.has(p.id)) return `de naam ${p.id} komt dubbel voor`;
        ids.add(p.id);
    }

    if (q.tests.length === 0) return "er zijn geen tests";
    const byId = Object.fromEntries(q.parts.map(p => [p.id, p]));
    for (const t of q.tests) {
        if (!t.name) return "een test heeft geen naam";
        for (const id of Object.keys(t.inputs))
            if (byId[id]?.type !== "button") return `test "${t.name}" drukt op ${id}, maar dat is geen drukknop`;
        if (Object.keys(t.expect).length === 0) return `test "${t.name}" controleert niets`;
        for (const id of Object.keys(t.expect))
            if (!PART_TYPES[byId[id]?.type]?.output) return `test "${t.name}" controleert ${id}, maar dat is geen LED, motor of zoemer`;
    }

    try {
        compileSketch(q.code);
    } catch (err) {
        return `de code klopt niet: ${err.message}`;
    }

    const result = gradeCircuit(q, q.solution);
    const failed = result.tests.find(t => !t.passed);
    if (failed) return `de voorbeeldoplossing haalt test "${failed.name}" niet: ${failed.message}`;
    return null;
};


/* ---------- C++ (Arduino subset) to JavaScript ---------- */

const TYPES = "(?:unsigned\\s+long|unsigned\\s+int|unsigned\\s+char|long\\s+long|unsigned|int|long|short|bool|boolean|float|double|byte|char|word|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|String|void)";

/** Split on a separator, ignoring separators inside parentheses/brackets. */
const splitTopLevel = (s, sep) => {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        if ("([{".includes(s[i])) depth++;
        else if (")]}".includes(s[i])) depth--;
        else if (s[i] === sep && depth === 0) {
            out.push(s.slice(start, i));
            start = i + 1;
        }
    }
    out.push(s.slice(start));
    return out;
};

const transpile = (cpp) => {
    let s = cpp
        .replace(/^\s*#include.*$/gm, "")
        .replace(/^\s*#define\s+(\w+)\s+(.+?)\s*$/gm, "const $1 = $2;")
        .replace(new RegExp(`\\(\\s*${TYPES}\\s*\\)`, "g"), "") // casts
        .replace(/\b(\d+)(?:UL|ul|LU|L|l|U|u)\b/g, "$1"); // number suffixes

    // function definitions: drop the return type and parameter types
    s = s.replace(new RegExp(`\\b${TYPES}\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, "g"), (_m, name, params) => {
        const names = params.split(",").map(p => p.trim().split(/[\s*&]+/).pop()).filter(p => p && p !== "void");
        return `function ${name}(${names.join(", ")}) {`;
    });

    // arrays: int pins[] = {2, 3};
    s = s.replace(new RegExp(`\\b(const\\s+)?(?:static\\s+)?(?:volatile\\s+)?${TYPES}\\s+(\\w+)\\s*\\[\\s*\\w*\\s*\\]\\s*=\\s*\\{([^}]*)\\}`, "g"),
        (_m, c, name, items) => `${c ? "const" : "let"} ${name} = [${items}]`);

    // variable declarations
    s = s.replace(new RegExp(`\\b(const\\s+)?(?:static\\s+)?(?:volatile\\s+)?${TYPES}\\s+(?=[A-Za-z_])`, "g"), (_m, c) => c ? "const " : "let ");
    s = s.replace(/\blet\s+(\w+)\s*;/g, "let $1 = 0;"); // C globals start at 0

    return s;
};

/** Make loops interruptible, so a sketch that hangs cannot freeze grading. */
const addLoopGuards = (src) => {
    let out = "", last = 0, m;
    const re = /\b(while|for)\s*\(/g;
    while ((m = re.exec(src))) {
        const open = m.index + m[0].length - 1;
        let depth = 0, close = -1;
        for (let j = open; j < src.length; j++) {
            if (src[j] === "(") depth++;
            else if (src[j] === ")" && --depth === 0) {
                close = j;
                break;
            }
        }
        if (close < 0) break;

        const inner = src.slice(open + 1, close);
        out += src.slice(last, m.index);
        if (m[1] === "while") {
            out += `while (__tick() && (${inner}))`;
        } else {
            const parts = splitTopLevel(inner, ";");
            const range = /^\s*(let|const)\s+(\w+)\s*:\s*(.+)$/s.exec(inner);
            if (parts.length === 3) out += `for (${parts[0]}; __tick() && (${parts[1].trim() || "true"}); ${parts[2]})`;
            else if (range) out += `for (${range[1]} ${range[2]} of ${range[3]})`;
            else out += src.slice(m.index, close + 1);
        }
        last = close + 1;
        re.lastIndex = close + 1;
    }
    return out + src.slice(last);
};

const API = ["pinMode", "digitalWrite", "digitalRead", "analogRead", "analogWrite", "delay", "delayMicroseconds",
    "millis", "micros", "Serial", "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "LED_BUILTIN",
    "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "constrain", "map", "min", "max", "abs",
    "random", "randomSeed", "tone", "noTone", "__tick"];

/**
 * Translate an Arduino sketch to a JavaScript factory. Calling the factory with the API runs the global
 * declarations and returns `{setup, loop}`.
 * @throws {SyntaxError} when the code can not be translated
 */
export const compileSketch = (cpp) => {
    const js = addLoopGuards(transpile(cpp));
    return new Function(...API, `"use strict";\n${js}\n;return {` +
        `setup: typeof setup === "function" ? setup : function () {}, ` +
        `loop: typeof loop === "function" ? loop : function () {}};`);
};


/* ---------- electrical simulation ---------- */

/** Solve A x = b with Gaussian elimination (partial pivoting). */
const solveLinear = (A, b) => {
    const n = b.length;
    for (let c = 0; c < n; c++) {
        let pivot = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
        [A[c], A[pivot]] = [A[pivot], A[c]];
        [b[c], b[pivot]] = [b[pivot], b[c]];
        const d = A[c][c] || 1e-30;
        for (let r = c + 1; r < n; r++) {
            const f = A[r][c] / d;
            if (f === 0) continue;
            for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = b[r];
        for (let k = r + 1; k < n; k++) sum -= A[r][k] * x[k];
        x[r] = sum / (A[r][r] || 1e-30);
    }
    return x;
};

/**
 * Solve the circuit for one moment in time.
 * @param state pin modes and output levels of the Arduino
 * @param pressed ids of the buttons that are pressed
 * @param bias voltage floating inputs drift to (solved for 0 V and 5 V to detect floating inputs)
 */
const solveCircuit = (parts, wires, pressed, state, bias) => {
    const parent = {};
    const find = (x) => {
        while (parent[x] !== undefined && parent[x] !== x) {
            parent[x] = parent[parent[x]] ?? parent[x];
            x = parent[x];
        }
        return x;
    };
    const union = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };

    for (const [a, b] of wires) union(a, b);
    union(`${NANO}.GND2`, `${NANO}.GND`);
    for (const p of parts) {
        if (p.type !== "button") continue;
        union(`${p.id}.1l`, `${p.id}.1r`);
        union(`${p.id}.2l`, `${p.id}.2r`);
        if (pressed.has(p.id)) union(`${p.id}.1l`, `${p.id}.2l`);
    }

    const net = (terminal) => find(terminal);
    const gnd = net(`${NANO}.GND`), vcc = net(`${NANO}.5V`);
    if (gnd === vcc) return {
        problems: ["Kortsluiting: 5V is rechtstreeks met GND verbonden!"],
        issues: [{kind: "short", id: NANO, message: "Kortsluiting: 5V is rechtstreeks met GND verbonden!"}],
        on: new Set(),
        pinVoltage: () => 0, isOn: () => false
    };

    const fixed = new Map([[gnd, 0], [vcc, 5]]);
    const elements = [];

    // Arduino pins
    for (let n = 2; n <= 19; n++) {
        const mode = state.modes[n] ?? MODE.INPUT;
        const node = `__src${n}`;
        const level = mode === MODE.OUTPUT ? (state.out[n] ? 5 : 0) : mode === MODE.INPUT_PULLUP ? 5 : bias;
        const resistance = mode === MODE.OUTPUT ? MODEL.pinResistance : mode === MODE.INPUT_PULLUP ? MODEL.pullup : MODEL.floating;
        fixed.set(node, level);
        elements.push({kind: "pin", pin: n, a: node, b: net(`${NANO}.${pinName(n)}`), g: 1 / resistance, ieq: 0});
    }

    // parts
    for (const p of parts) {
        const t = (name) => net(`${p.id}.${name}`);
        if (p.type === "resistor") elements.push({kind: "resistor", part: p, a: t("1"), b: t("2"), g: 1 / p.value, ieq: 0});
        if (p.type === "motor") elements.push({kind: "motor", part: p, a: t("1"), b: t("2"), g: 1 / MODEL.motorResistance, ieq: 0});
        if (p.type === "led") elements.push({kind: "diode", part: p, a: t("a"), b: t("k"), vf: LED_COLORS[p.color], r: MODEL.ledResistance, on: false});
        if (p.type === "buzzer") elements.push({kind: "diode", part: p, a: t("p"), b: t("n"), vf: MODEL.buzzerVf, r: MODEL.buzzerResistance, on: false});
        if (p.type === "npn") {
            const be = {kind: "diode", part: p, base: true, a: t("b"), b: t("e"), vf: MODEL.beVf, r: MODEL.beResistance, on: false};
            elements.push(be, {kind: "switch", part: p, a: t("c"), b: t("e"), be, on: false});
        }
    }

    // unknown node voltages
    const index = new Map();
    for (const e of elements) for (const node of [e.a, e.b])
        if (!fixed.has(node) && !index.has(node)) index.set(node, index.size);

    let voltages = new Map(fixed);
    const voltage = (node) => voltages.get(node) ?? 0;

    // linear stamp of each element: current from a to b = g * (Va - Vb) - ieq
    const linearize = (e) =>
        e.kind === "diode" ? (e.on ? {g: 1 / e.r, ieq: e.vf / e.r} : {g: MODEL.off, ieq: 0}) :
        e.kind === "switch" ? {g: e.on ? 1 / MODEL.ceResistance : MODEL.off, ieq: 0} :
        {g: e.g, ieq: e.ieq};
    const current = (e) => {
        const {g, ieq} = linearize(e);
        return g * (voltage(e.a) - voltage(e.b)) - ieq;
    };

    for (let iteration = 0; iteration < 60; iteration++) {
        const n = index.size;
        const A = Array.from({length: n}, () => new Array(n).fill(0));
        const b = new Array(n).fill(0);
        for (let i = 0; i < n; i++) A[i][i] = 1e-12;

        for (const e of elements) {
            const {g, ieq} = linearize(e);
            const ia = index.get(e.a), ib = index.get(e.b);
            if (ia !== undefined) {
                A[ia][ia] += g;
                b[ia] += ieq;
                if (ib !== undefined) A[ia][ib] -= g;
                else b[ia] += g * fixed.get(e.b);
            }
            if (ib !== undefined) {
                A[ib][ib] += g;
                b[ib] -= ieq;
                if (ia !== undefined) A[ib][ia] -= g;
                else b[ib] += g * fixed.get(e.a);
            }
        }

        const x = solveLinear(A, b);
        voltages = new Map(fixed);
        for (const [node, i] of index) voltages.set(node, x[i]);

        // update the piecewise linear states until nothing changes
        let changed = false;
        for (const e of elements) {
            if (e.kind === "diode") {
                const vd = voltage(e.a) - voltage(e.b);
                if (e.on && (vd - e.vf) / e.r < -1e-9) {
                    e.on = false;
                    changed = true;
                } else if (!e.on && vd > e.vf + 1e-6) {
                    e.on = true;
                    changed = true;
                }
            } else if (e.kind === "switch") {
                const want = e.be.on && current(e.be) > MODEL.transistorOnBase;
                if (want !== e.on) {
                    e.on = want;
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }

    // check what is on and what broke
    /** @type {{kind: string, id: string, pin?: number, message: string}[]} */
    const issues = [];
    const on = new Set();
    for (const e of elements) {
        const i = current(e);
        if (e.kind === "pin" && Math.abs(i) > MODEL.pinMaxCurrent)
            issues.push({kind: "pin", id: NANO, pin: e.pin,
              message: `Pin ${pinName(e.pin)} moet ${formatMilliAmps(i)} leveren, maar kan maximaal 40 mA aan.`});
        if (e.kind === "diode" && !e.base && e.part.type === "led") {
            if (i > MODEL.ledMaxCurrent) issues.push({kind: "burn", id: e.part.id,
              message: `${e.part.id} brandt door: er loopt ${formatMilliAmps(i)} doorheen (gebruik een voorschakelweerstand).`});
            if (i > MODEL.ledOnCurrent) on.add(e.part.id);
        }
        if (e.kind === "diode" && e.part.type === "buzzer" && i > MODEL.buzzerOnCurrent) on.add(e.part.id);
        if (e.kind === "diode" && e.base && i > MODEL.transistorMaxBase)
            issues.push({kind: "burn", id: e.part.id,
              message: `De basisstroom van ${e.part.id} is te groot (${formatMilliAmps(i)}), gebruik een basisweerstand.`});
        if (e.kind === "switch" && Math.abs(i) > MODEL.transistorMaxCurrent)
            issues.push({kind: "burn", id: e.part.id, message: `Er loopt te veel stroom door ${e.part.id} (${formatMilliAmps(i)}): kortsluiting?`});
        if (e.kind === "motor" && Math.abs(i) > MODEL.motorOnCurrent) on.add(e.part.id);
        if (e.kind === "resistor" && Math.abs(i) > 1) issues.push({kind: "short", id: e.part.id, message: `Kortsluiting via ${e.part.id}!`});
    }

    return {
        problems: issues.map(x => x.message),
        issues, on,
        pinVoltage: (n) => voltage(net(`${NANO}.${pinName(n)}`)),
        isOn: (id) => on.has(id)
    };
};


const HANG = "__hang__";

const runTest = (question, circuit, test, factory) => {
    const pressed = new Set(Object.keys(test.inputs));
    const state = {modes: {}, out: {}};
    const snapshots = [{time: 0, modes: {}, out: {}}];
    const issues = new Set();
    const cache = new Map();
    let time = 0, ticks = 0, seed = 12345;

    const solve = (bias) => {
        const key = JSON.stringify([state.modes, state.out, bias]);
        if (!cache.has(key)) cache.set(key, solveCircuit(question.parts, circuit.wires, pressed, state, bias));
        return cache.get(key);
    };
    const snapshot = () => snapshots.push({time, modes: {...state.modes}, out: {...state.out}});
    const tick = () => {
        if (++ticks > 2_000_000) throw new Error(HANG);
        return true;
    };
    const pin = (p) => {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 2 || n > 19) throw new Error(`pin ${p} bestaat niet (gebruik 2 t/m 13 of A0 t/m A5)`);
        return n;
    };

    const api = {
        pinMode(p, mode) {
            state.modes[pin(p)] = mode;
            snapshot();
        },
        digitalWrite(p, value) {
            const n = pin(p);
            if (state.modes[n] === MODE.OUTPUT) state.out[n] = value ? 1 : 0;
            else state.modes[n] = value ? MODE.INPUT_PULLUP : MODE.INPUT; // like a real Arduino
            snapshot();
        },
        analogWrite(p, value) {
            const n = pin(p);
            state.modes[n] = MODE.OUTPUT;
            state.out[n] = value > 0 ? 1 : 0;
            snapshot();
        },
        digitalRead(p) {
            const n = pin(p);
            tick();
            if (state.modes[n] === MODE.OUTPUT) return state.out[n] ? 1 : 0;
            const low = solve(0).pinVoltage(n) > 2.5, high = solve(5).pinVoltage(n) > 2.5;
            if (low !== high) issues.add(`Pin ${pinName(n)} zweeft: hij is niet duidelijk HOOG of LAAG. Mist er een pull-up- of pull-downweerstand?`);
            return low ? 1 : 0;
        },
        analogRead(p) {
            tick();
            return Math.round(clamp(solve(0).pinVoltage(pin(p)), 0, 5) / 5 * 1023);
        },
        delay(ms) {
            time += Math.max(0, Number(ms) || 0);
            tick();
        },
        delayMicroseconds(us) {
            time += Math.max(0, Number(us) || 0) / 1000;
            tick();
        },
        millis: () => Math.floor(time),
        micros: () => Math.floor(time * 1000),
        Serial: {begin() {}, print() {}, println() {}, write() {}, available: () => 0, read: () => -1},
        HIGH: 1, LOW: 0, INPUT: MODE.INPUT, OUTPUT: MODE.OUTPUT, INPUT_PULLUP: MODE.INPUT_PULLUP, LED_BUILTIN: 13,
        A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21,
        constrain: (x, lo, hi) => clamp(x, lo, hi),
        map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c),
        min: Math.min, max: Math.max, abs: Math.abs,
        random(a, b) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            const [lo, hi] = b === undefined ? [0, a] : [a, b];
            return lo + seed % Math.max(1, hi - lo);
        },
        randomSeed() {}, tone() {}, noTone() {},
        __tick: tick
    };

    try {
        const sketch = factory(...API.map(name => api[name]));
        sketch.setup();
        for (let loops = 0; time < test.at && loops < 200_000; loops++) {
            tick();
            sketch.loop();
            time += 0.1; // a loop without delay still takes a little time
        }
    } catch (err) {
        return {passed: false, message: err.message === HANG ?
            "De code blijft hangen (een oneindige lus zonder delay?)." : `Fout tijdens het uitvoeren van de code: ${err.message}`};
    }

    if (issues.size) return {passed: false, message: [...issues][0]};

    // the outputs at the moment of the test
    const moment = snapshots.filter(s => s.time <= test.at).pop();
    const result = solveCircuit(question.parts, circuit.wires, pressed, moment, 0);
    if (result.problems.length) return {passed: false, message: result.problems.join(" ")};

    const byId = Object.fromEntries(question.parts.map(p => [p.id, p]));
    const verbs = {
        led: {on: "brandt", off: "is uit", shouldOn: "branden", shouldOff: "uit zijn"},
        motor: {on: "draait", off: "staat stil", shouldOn: "draaien", shouldOff: "stilstaan"},
        buzzer: {on: "zoemt", off: "is stil", shouldOn: "zoemen", shouldOff: "stil zijn"}
    };
    for (const [id, want] of Object.entries(test.expect)) {
        const actual = result.isOn(id);
        if (actual !== want) {
            const v = verbs[byId[id]?.type] ?? verbs.led;
            return {passed: false, message: `${id} ${actual ? v.on : v.off}, maar moet ${want ? v.shouldOn : v.shouldOff}.`};
        }
    }
    return {passed: true, message: "Goed!"};
};

/**
 * Grade a circuit for a question. The question is only worth its point when all tests pass.
 * @param {CircuitQuestion} question
 * @param {unknown} circuitInput
 * @returns {CircuitGrade}
 */
export const gradeCircuit = (question, circuitInput) => {
    const circuit = sanitizeCircuit(circuitInput, question.parts);

    let factory;
    try {
        factory = compileSketch(question.code);
    } catch (err) {
        return {score: 0, tests: question.tests.map(t => ({name: t.name, passed: false, message: `De code kan niet worden uitgevoerd: ${err.message}`}))};
    }

    const tests = question.tests.map(t => ({name: t.name, ...runTest(question, circuit, t, factory)}));
    const score = (circuit.wires.length > 0 && tests.length > 0 && tests.every(t => t.passed)) ? 1 : 0;
    return {score, tests};
};


/* ---------- live simulation (results page) ---------- */

/**
 * Wrap calls to the given functions in `(yield* name(...))`, so they can pause the sketch.
 * @param {string} src
 * @param {string[]} names
 */
const wrapCalls = (src, names) => {
    if (!names.length) return src;
    const re = new RegExp(`(?<![\\w.*])(${names.join("|")})\\s*\\(`, "g");
    const starts = [...src.matchAll(re)].map(m => m.index).filter(i => !/function\*\s*$/.test(src.slice(Math.max(0, i - 12), i)));
    for (const start of starts.reverse()) {
        const open = src.indexOf("(", start);
        let depth = 0, close = -1;
        for (let j = open; j < src.length; j++) {
            if (src[j] === "(") depth++;
            else if (src[j] === ")" && --depth === 0) {
                close = j;
                break;
            }
        }
        if (close < 0) continue;
        src = `${src.slice(0, start)}(yield* ${src.slice(start, close + 1)})${src.slice(close + 1)}`;
    }
    return src;
};

/**
 * Like `compileSketch`, but every function is a generator: `delay()` and busy loops pause the sketch,
 * so it can run in real time and react to buttons being pressed.
 * @param {string} cpp
 */
export const compileSketchLive = (cpp) => {
    let js = addLoopGuards(transpile(cpp)).replaceAll("__tick()", "(yield* __tick())");
    const userFunctions = [...js.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]);
    js = js.replace(/function\s+(\w+)\s*\(/g, "function* $1(");
    js = wrapCalls(js, [...userFunctions, "delay", "delayMicroseconds"]);
    return new Function(...API, `"use strict";\n${js}\n;return {` +
        `setup: typeof setup === "function" ? setup : function* () {}, ` +
        `loop: typeof loop === "function" ? loop : function* () {}};`);
};

/**
 * A circuit that runs in real time.
 * @param {CircuitQuestion} question
 * @param {unknown} circuitInput
 */
export const createLiveSimulation = (question, circuitInput) => {
    const circuit = sanitizeCircuit(circuitInput, question.parts);
    const state = {modes: {}, out: {}};
    const pressed = new Set();
    const floating = new Set();
    /** parts (and Arduino pins) that broke stay broken until the simulation restarts */
    const burned = new Set(), damagedPins = new Set();
    const messages = new Map();
    const cache = new Map();
    let time = 0, target = 0, seed = 12345, error = null;
    let generator = null, phase = "setup", sketch = null;

    const solve = (bias) => {
        const key = JSON.stringify([state.modes, state.out, [...pressed].sort(), bias]);
        if (!cache.has(key)) {
            if (cache.size > 500) cache.clear();
            cache.set(key, solveCircuit(question.parts, circuit.wires, pressed, state, bias));
        }
        return cache.get(key);
    };
    const pin = (p) => {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 2 || n > 19) throw new Error(`pin ${p} bestaat niet (gebruik 2 t/m 13 of A0 t/m A5)`);
        return n;
    };
    const api = {
        pinMode(p, mode) { state.modes[pin(p)] = mode; },
        digitalWrite(p, value) {
            const n = pin(p);
            if (state.modes[n] === MODE.OUTPUT) state.out[n] = value ? 1 : 0;
            else state.modes[n] = value ? MODE.INPUT_PULLUP : MODE.INPUT;
        },
        analogWrite(p, value) {
            const n = pin(p);
            state.modes[n] = MODE.OUTPUT;
            state.out[n] = value > 0 ? 1 : 0;
        },
        digitalRead(p) {
            const n = pin(p);
            if (state.modes[n] === MODE.OUTPUT) return state.out[n] ? 1 : 0;
            const low = solve(0).pinVoltage(n) > 2.5, high = solve(5).pinVoltage(n) > 2.5;
            if (low !== high) floating.add(n);
            else floating.delete(n);
            // a floating pin picks up noise: it flips between HIGH and LOW
            return low !== high ? (Math.floor(time / 137) % 2) : (low ? 1 : 0);
        },
        analogRead(p) {
            return Math.round(clamp(solve(0).pinVoltage(pin(p)), 0, 5) / 5 * 1023);
        },
        *delay(ms) {
            const until = time + Math.max(0, Number(ms) || 0);
            while (target < until) {
                time = target;
                yield;
            }
            time = until;
        },
        *delayMicroseconds(us) {
            yield* api.delay(Math.max(0, Number(us) || 0) / 1000);
        },
        millis: () => Math.floor(time),
        micros: () => Math.floor(time * 1000),
        Serial: {begin() {}, print() {}, println() {}, write() {}, available: () => 0, read: () => -1},
        HIGH: 1, LOW: 0, INPUT: MODE.INPUT, OUTPUT: MODE.OUTPUT, INPUT_PULLUP: MODE.INPUT_PULLUP, LED_BUILTIN: 13,
        A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21,
        constrain: (x, lo, hi) => clamp(x, lo, hi),
        map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c),
        min: Math.min, max: Math.max, abs: Math.abs,
        random(a, b) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            const [lo, hi] = b === undefined ? [0, a] : [a, b];
            return lo + seed % Math.max(1, hi - lo);
        },
        randomSeed() {}, tone() {}, noTone() {},
        *__tick() { // a busy loop takes a little time, and pauses when the real time is reached
            time += 0.01;
            if (time >= target) yield;
            return true;
        }
    };

    const reset = () => {
        Object.keys(state.modes).forEach(k => delete state.modes[k]);
        Object.keys(state.out).forEach(k => delete state.out[k]);
        floating.clear();
        burned.clear();
        damagedPins.clear();
        messages.clear();
        cache.clear();
        time = target = 0;
        seed = 12345;
        error = null;
        phase = "setup";
        try {
            sketch = compileSketchLive(question.code)(...API.map(name => api[name]));
            generator = sketch.setup();
        } catch (err) {
            error = `De code kan niet worden uitgevoerd: ${err.message}`;
        }
    };

    /** Run the sketch until (virtual) time `to` (ms). */
    const advance = (to) => {
        if (error) return;
        target = to;
        try {
            for (let guard = 0; guard < 100000 && time < target; guard++) {
                const step = generator.next();
                if (step.done) {
                    if (phase === "setup") phase = "loop";
                    else time += 0.1; // a loop without delay still takes a little time
                    generator = sketch.loop();
                }
            }
        } catch (err) {
            error = `Fout tijdens het uitvoeren van de code: ${err.message}`;
        }
        if (time < target) time = target;
    };

    reset();

    return {
        get time() { return time; },
        reset,
        press(id, down) {
            if (down) pressed.add(id);
            else pressed.delete(id);
        },
        /**
         * Advance to `to` ms and describe what the circuit is doing now.
         * @returns {{on: Set<string>, burned: Set<string>, damagedPins: Set<number>, floating: Set<number>, short: boolean, messages: string[], error: string | null}}
         */
        step(to) {
            advance(to);
            const result = error ? null : solve(0);
            let short = false;
            for (const issue of result?.issues ?? []) {
                if (issue.kind === "burn") burned.add(issue.id);
                if (issue.kind === "pin") damagedPins.add(issue.pin);
                if (issue.kind === "short") short = true;
                messages.set(issue.message.replace(/\d+ mA/g, "").trim(), issue.message);
            }
            for (const n of floating)
                messages.set(`floating${n}`, `Pin ${pinName(n)} zweeft: zonder pull-up- of pull-downweerstand leest hij willekeurig HOOG of LAAG.`);
            const on = new Set([...(result?.on ?? [])].filter(id => !burned.has(id)));
            return {on, burned, damagedPins, floating, short, messages: [...messages.values()], error};
        }
    };
};
