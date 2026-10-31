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

// Drag and drop editor for Arduino circuits, using the Wokwi elements (https://elements.wokwi.com) for the parts.
//  - drag parts to move them, double-click a part to rotate it
//  - drag from one pin to another (or click both) to draw a wire
//  - click a wire and then the × to remove it (or press Delete)
//
// Requires the Wokwi elements bundle to be loaded on the page. Wokwi has no NPN transistor or DC motor,
// those two are drawn here in the same style.

import { NANO, TERMINAL_NAMES, CANVAS, partLabel } from "/static/js/circuit.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const WOKWI_LED_COLORS = {rood: "red", geel: "yellow", groen: "green", blauw: "blue", wit: "white"};
const WIRE_COLORS = ["#1c7ed6", "#2f9e44", "#9c36b5", "#e8590c", "#0c8599", "#c2255c", "#5c940d", "#5f3dc4"];

const svgPart = (w, h, inner) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = inner;
    return svg;
};

/**
 * Per part type: size, pins (our terminal name → position from the top left corner) and how to create it.
 * Pin positions are those of the Wokwi elements' `pinInfo`.
 */
const PARTS = {
    nano: {
        width: 169.7, height: 67.3,
        pins: {
            ...Object.fromEntries([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n, i) => [`D${n}`, [19.7 + i * 9.6, 4.8]])),
            GND2: [125.3, 4.8],
            D13: [19.7, 62.4],
            ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(n => [`A${n}`, [48.5 + n * 9.6, 62.4]])),
            "5V": [125.3, 62.4], GND: [144.5, 62.4]
        },
        create: () => document.createElement("wokwi-arduino-nano")
    },
    led: {
        width: 40, height: 50, pins: {a: [25, 42], k: [15, 42]},
        create: (p) => {
            const el = document.createElement("wokwi-led");
            el.setAttribute("color", WOKWI_LED_COLORS[p.color] ?? "red");
            return el;
        }
    },
    resistor: {
        width: 59.1, height: 11.3, pins: {"1": [0, 5.65], "2": [58.8, 5.65]},
        create: (p) => {
            const el = document.createElement("wokwi-resistor");
            el.setAttribute("value", String(p.value));
            return el;
        }
    },
    button: {
        width: 67.3, height: 45.3, pins: {"1l": [0, 13], "2l": [0, 32], "1r": [67, 13], "2r": [67, 32]},
        create: () => {
            const el = document.createElement("wokwi-pushbutton");
            el.setAttribute("color", "red");
            return el;
        }
    },
    buzzer: {
        width: 75, height: 84, pins: {n: [27, 84], p: [37, 84]},
        create: () => document.createElement("wokwi-buzzer")
    },
    npn: { // TO-92 package, legs E B C seen from the flat side
        width: 24, height: 42, pins: {e: [2.4, 42], b: [12, 42], c: [21.6, 42]},
        create: () => svgPart(24, 42, `
          <defs><linearGradient id="to92" x1="0" x2="1"><stop offset="0" stop-color="#3b3b3b"/><stop offset="0.5" stop-color="#1a1a1a"/><stop offset="1" stop-color="#2b2b2b"/></linearGradient></defs>
          <path d="M 2.4 22 L 2.4 42 M 12 22 L 12 42 M 21.6 22 L 21.6 42" stroke="#9a9a9a" stroke-width="1.4"/>
          <path d="M 2 4 Q 12 -2 22 4 L 22 22 L 2 22 Z" fill="url(#to92)" stroke="#000" stroke-width="0.6"/>
          <text x="12" y="13" text-anchor="middle" font-size="4.2" fill="#ddd" font-family="sans-serif">NPN</text>
          <text x="12" y="18.5" text-anchor="middle" font-size="3" fill="#aaa" font-family="sans-serif">2N2222</text>
          <text x="2.4" y="29" text-anchor="middle" font-size="4" fill="#555" font-family="sans-serif" font-weight="bold">E</text>
          <text x="12" y="29" text-anchor="middle" font-size="4" fill="#555" font-family="sans-serif" font-weight="bold">B</text>
          <text x="21.6" y="29" text-anchor="middle" font-size="4" fill="#555" font-family="sans-serif" font-weight="bold">C</text>`)
    },
    motor: { // small hobby DC motor seen from the side, solder tabs at the bottom
        width: 64, height: 40, pins: {"1": [22, 40], "2": [36, 40]},
        create: () => svgPart(64, 40, `
          <defs><linearGradient id="motorcan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ecef"/><stop offset="0.45" stop-color="#adb5bd"/><stop offset="1" stop-color="#6c757d"/></linearGradient></defs>
          <path d="M 22 30 L 22 40 M 36 30 L 36 40" stroke="#c9a227" stroke-width="2"/>
          <rect x="4" y="4" width="46" height="28" rx="6" fill="url(#motorcan)" stroke="#495057" stroke-width="0.8"/>
          <rect x="4" y="4" width="8" height="28" rx="3" fill="#c92a2a" stroke="#7a1616" stroke-width="0.6"/>
          <rect x="50" y="14" width="6" height="8" fill="#868e96"/><rect x="56" y="16.5" width="5" height="3" fill="#ced4da"/>
          <ellipse class="motor-blade" cx="61.5" cy="18" rx="1.6" ry="9" fill="#f08c00" stroke="#a35a00" stroke-width="0.5"/>
          <text x="31" y="21" text-anchor="middle" font-size="9" font-weight="bold" fill="#343a40" font-family="sans-serif">M</text>`)
    }
};

const rotate = ([x, y], rot) =>
    rot === 90 ? [-y, x] : rot === 180 ? [-x, -y] : rot === 270 ? [y, -x] : [x, y];

/** Pin offset relative to the center of the part. */
const pinOffset = (type, pin, rot) => {
    const def = PARTS[type];
    const [x, y] = def.pins[pin];
    return rotate([x - def.width / 2, y - def.height / 2], rot);
};

/** Place parts that have no position yet around the Arduino. */
const defaultPositions = (parts, positions) => {
    const slots = [[55, 45], [145, 45], [295, 45], [385, 45], [55, 210], [145, 210], [295, 210], [385, 210],
                   [40, 128], [400, 128], [220, 30], [220, 225]];
    const out = {...positions};
    out[NANO] ??= {x: 220, y: 128, rot: 0};
    let slot = 0;
    for (const p of parts) {
        if (out[p.id]) continue;
        const [x, y] = slots[slot++ % slots.length];
        out[p.id] = {x, y, rot: 0};
    }
    return out;
};


/* ---------- wire routing ---------- */

const GRID = 4.8; // half a pin pitch
const COLS = Math.ceil(CANVAS.width / GRID) + 1, ROWS = Math.ceil(CANVAS.height / GRID) + 1;
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1]; // right, left, down, up
const COST = {step: 1, bend: 6, body: 400, clearance: 4, pin: 300, overlap: 30, cross: 4};

/** Binary heap of [priority, value]. */
const createHeap = () => {
    const heap = [];
    return {
        get size() { return heap.length; },
        push(p, v) {
            heap.push([p, v]);
            for (let k = heap.length - 1; k > 0;) {
                const parent = (k - 1) >> 1;
                if (heap[parent][0] <= heap[k][0]) break;
                [heap[parent], heap[k]] = [heap[k], heap[parent]];
                k = parent;
            }
        },
        pop() {
            const top = heap[0], last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                for (let k = 0; ;) {
                    const l = 2 * k + 1, r = l + 1;
                    let m = k;
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                    if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                    if (m === k) break;
                    [heap[m], heap[k]] = [heap[k], heap[m]];
                    k = m;
                }
            }
            return top[1];
        }
    };
};

/**
 * Route wires around parts with A* on a grid.
 *  - every wire leaves its pin straight outwards (away from the part) before turning
 *  - going through a part, over another pin or along a wire of another net is expensive; crossing is cheap
 *  - wires of the same net may share a track, so connections to one node merge neatly
 * @param {{a: number[], b: number[], dirA: number, dirB: number, net: number}[]} wires pin positions and exit directions
 * @param {number[][]} boxes part bodies [x1, y1, x2, y2]
 * @param {number[][]} pins all pin positions
 */
const routeWires = (wires, boxes, pins) => {
    const cell = (x, y) => Math.min(ROWS - 1, Math.max(0, Math.round(y / GRID))) * COLS + Math.min(COLS - 1, Math.max(0, Math.round(x / GRID)));
    const base = new Float32Array(COLS * ROWS);
    for (const [x1, y1, x2, y2] of boxes) {
        for (let c = Math.max(0, Math.floor(x1 / GRID) - 1); c <= Math.min(COLS - 1, Math.ceil(x2 / GRID) + 1); c++) {
            for (let r = Math.max(0, Math.floor(y1 / GRID) - 1); r <= Math.min(ROWS - 1, Math.ceil(y2 / GRID) + 1); r++) {
                const inside = c * GRID > x1 && c * GRID < x2 && r * GRID > y1 && r * GRID < y2;
                base[r * COLS + c] += inside ? COST.body : COST.clearance;
            }
        }
    }
    for (const [x, y] of pins) base[cell(x, y)] += COST.pin;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++)
        if (c < 2 || r < 2 || c > COLS - 3 || r > ROWS - 3) base[r * COLS + c] += COST.clearance; // keep off the edges

    // per cell: the net that uses it horizontally / vertically (-1 = free)
    const usedH = new Int32Array(COLS * ROWS).fill(-1), usedV = new Int32Array(COLS * ROWS).fill(-1);
    const N = COLS * ROWS * 4;
    const cost = new Float64Array(N), from = new Int32Array(N);

    const routeOne = ({a, b, dirA, dirB, net}) => {
        // stubs: leave the pin straight outwards for two grid steps
        const stubA = [a[0] + DX[dirA] * GRID * 2, a[1] + DY[dirA] * GRID * 2];
        const stubB = [b[0] + DX[dirB] * GRID * 2, b[1] + DY[dirB] * GRID * 2];
        const start = cell(...stubA), end = cell(...stubB);
        const pinA = cell(...a), pinB = cell(...b);

        cost.fill(Infinity);
        from.fill(-1);
        const heap = createHeap();
        const ec = end % COLS, er = Math.floor(end / COLS);
        const h = (c) => Math.abs(c % COLS - ec) + Math.abs(Math.floor(c / COLS) - er);
        cost[start * 4 + dirA] = 0;
        heap.push(h(start), start * 4 + dirA);

        let found = -1;
        for (let guard = 0; heap.size && guard < 400000; guard++) {
            const st = heap.pop();
            const c0 = st >> 2, dir = st & 3;
            if (c0 === end) {
                found = st;
                break;
            }
            const c = c0 % COLS, r = Math.floor(c0 / COLS);
            for (let d = 0; d < 4; d++) {
                if ((d ^ 1) === dir) continue; // no U-turns
                const nc = c + DX[d], nr = r + DY[d];
                if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
                const next = nr * COLS + nc;
                const horizontal = d < 2;
                const same = horizontal ? usedH[next] : usedV[next], other = horizontal ? usedV[next] : usedH[next];
                let step = COST.step + (d !== dir ? COST.bend : 0);
                if (next !== end && next !== pinA && next !== pinB) step += base[next];
                if (same >= 0 && same !== net) step += COST.overlap;
                if (other >= 0 && other !== net) step += COST.cross;
                // arriving at the end must happen against the exit direction of pin B
                if (next === end && (d ^ 1) !== dirB && dirB !== undefined) step += COST.bend;
                const ns = next * 4 + d, total = cost[st] + step;
                if (total < cost[ns]) {
                    cost[ns] = total;
                    from[ns] = st;
                    heap.push(total + h(next), ns);
                }
            }
        }

        // grid cells of the path
        const cells = [];
        if (found >= 0) for (let st = found; st >= 0; st = from[st]) cells.push(st >> 2);
        else cells.push(start, end);
        cells.reverse();
        for (let k = 0; k < cells.length; k++) {
            const prev = cells[k - 1] ?? cells[k], next = cells[k + 1] ?? cells[k];
            if (Math.abs(next - prev) === 2 * COLS || (next === cells[k] && Math.abs(cells[k] - prev) === COLS) || (prev === cells[k] && Math.abs(next - cells[k]) === COLS))
                usedV[cells[k]] = net;
            else if (Math.abs(next - prev) === 2 || (next === cells[k] && Math.abs(cells[k] - prev) === 1) || (prev === cells[k] && Math.abs(next - cells[k]) === 1))
                usedH[cells[k]] = net;
            else usedH[cells[k]] = usedV[cells[k]] = net; // corner
        }

        // corners only, in canvas coordinates
        const corners = [];
        cells.forEach((c, k) => {
            const prev = cells[k - 1], next = cells[k + 1];
            if (prev === undefined || next === undefined || (next - c) !== (c - prev))
                corners.push([(c % COLS) * GRID, Math.floor(c / COLS) * GRID]);
        });
        return straighten(a, dirA, corners, b, dirB);
    };

    // route short wires first, they have the fewest options
    const order = wires.map((w, i) => i)
        .sort((i, j) => (Math.abs(wires[i].a[0] - wires[i].b[0]) + Math.abs(wires[i].a[1] - wires[i].b[1])) -
                        (Math.abs(wires[j].a[0] - wires[j].b[0]) + Math.abs(wires[j].a[1] - wires[j].b[1])));
    const routes = new Array(wires.length);
    for (const i of order) routes[i] = routeOne(wires[i]);
    return routes;
};

/**
 * Join the exact pin positions to the grid path without little diagonal or zigzag pieces:
 * the first and last runs are moved onto the pins' own coordinates.
 */
const straighten = (a, dirA, corners, b, dirB) => {
    const pts = corners.map(p => [...p]);
    const alignEnd = (pin, dir, first, second) => {
        const horizontal = dir < 2;
        if (!second) { // single grid point
            if (horizontal) first[1] = pin[1];
            else first[0] = pin[0];
            return;
        }
        const runHorizontal = Math.abs(first[1] - second[1]) < 1e-6;
        if (horizontal === runHorizontal) { // the first run continues the stub: put it on the pin's line
            if (horizontal) first[1] = second[1] = pin[1];
            else first[0] = second[0] = pin[0];
        } else { // the first run turns: the stub ends on the run
            if (horizontal) first[1] = pin[1];
            else first[0] = pin[0];
        }
    };
    if (pts.length) {
        alignEnd(a, dirA, pts[0], pts[1]);
        alignEnd(b, dirB, pts[pts.length - 1], pts[pts.length - 2]);
    }
    const out = [a, ...pts, b];

    // remove duplicates and points in the middle of a straight line
    const clean = [];
    for (const p of out) {
        const last = clean[clean.length - 1];
        if (last && Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) continue;
        const before = clean[clean.length - 2];
        if (before && last && ((Math.abs(before[0] - last[0]) < 0.01 && Math.abs(last[0] - p[0]) < 0.01) ||
                               (Math.abs(before[1] - last[1]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01))) clean.pop();
        clean.push(p);
    }
    // a remaining diagonal piece (tiny misalignment) becomes an L
    const result = [clean[0]];
    for (let k = 1; k < clean.length; k++) {
        const [px, py] = result[result.length - 1], [x, y] = clean[k];
        if (Math.abs(px - x) > 0.01 && Math.abs(py - y) > 0.01) result.push([x, py]);
        result.push([x, y]);
    }
    return result;
};

/** Direction (index in DX/DY) in which a wire leaves a pin: away from the nearest edge of the part. */
const exitDirection = (type, pin, rot) => {
    const def = PARTS[type];
    const [x, y] = def.pins[pin];
    const d = [x, def.width - x, y, def.height - y]; // left, right, top, bottom
    const side = d.indexOf(Math.min(...d));
    const vector = [[-1, 0], [1, 0], [0, -1], [0, 1]][side];
    const [vx, vy] = rotate(vector, rot);
    return vx > 0.5 ? 0 : vx < -0.5 ? 1 : vy > 0.5 ? 2 : 3;
};


/* ---------- editor ---------- */

/**
 * @param {HTMLElement} container
 * @param {{parts: {id: string, type: string}[], value?: any, readOnly?: boolean, onChange?: (value: any) => void}} options
 */
export const createCircuitEditor = (container, {parts, value, readOnly = false, onChange = () => {}, onButton = null}) => {
    const allParts = [{id: NANO, type: "nano"}, ...parts].filter(p => PARTS[p.type]);
    const byId = Object.fromEntries(allParts.map(p => [p.id, p]));
    const terminalExists = (key) => {
        const [id, pin] = key.split(".");
        return !!byId[id] && pin in PARTS[byId[id].type].pins;
    };

    let state = {positions: {}, wires: []};
    /** @type {(number[][] | null)[]} */
    let routes = [];
    let selectedWire = -1;
    /** The part the rotate buttons are shown for. */
    let selectedPart = null;
    /** @type {{from: string, x: number, y: number, startX: number, startY: number, moved: boolean} | null} */
    let wiring = null;
    /** @type {{id: string, dx: number, dy: number, moved: boolean} | null} */
    let drag = null;
    let frame = 0;
    /** What the live simulation shows (see `showSimulation`), or null. */
    let sim = null, simKey = "";
    /** Button held down with the mouse during a simulation. */
    let holding = null;

    // DOM: a scaled stage with the parts, and an SVG overlay for wires, pins and labels
    const root = document.createElement("div");
    root.className = "circuit-canvas";
    root.tabIndex = 0;
    const stage = document.createElement("div");
    stage.className = "circuit-stage";
    stage.style.width = `${CANVAS.width}px`;
    stage.style.height = `${CANVAS.height}px`;
    const partsLayer = document.createElement("div");
    partsLayer.className = "circuit-parts-layer";
    const overlay = document.createElementNS(SVG_NS, "svg");
    overlay.classList.add("circuit-overlay");
    overlay.setAttribute("viewBox", `0 0 ${CANVAS.width} ${CANVAS.height}`);
    overlay.setAttribute("width", String(CANVAS.width));
    overlay.setAttribute("height", String(CANVAS.height));
    stage.append(partsLayer, overlay);
    root.appendChild(stage);
    container.appendChild(root);

    let scale = 1;
    const resize = () => {
        const width = root.clientWidth;
        if (!width) return;
        scale = width / CANVAS.width;
        stage.style.transform = `scale(${scale})`;
        root.style.height = `${CANVAS.height * scale}px`;
    };
    new ResizeObserver(resize).observe(root);

    const partElements = {};
    for (const p of allParts) {
        const def = PARTS[p.type];
        const wrapper = document.createElement("div");
        wrapper.className = `circuit-part part-${p.type}`;
        wrapper.dataset.part = p.id;
        wrapper.style.width = `${def.width}px`;
        wrapper.style.height = `${def.height}px`;
        const el = def.create(p);
        el.classList.add("circuit-part-body");
        wrapper.appendChild(el);
        partsLayer.appendChild(wrapper);
        partElements[p.id] = wrapper;
    }

    const placeParts = () => {
        for (const p of allParts) {
            const pos = state.positions[p.id], def = PARTS[p.type];
            const el = partElements[p.id];
            el.style.left = `${pos.x - def.width / 2}px`;
            el.style.top = `${pos.y - def.height / 2}px`;
            el.style.transform = `rotate(${pos.rot}deg)`;
            el.classList.toggle("dragging", drag?.id === p.id);
        }
    };

    const setValue = (v) => {
        state = {
            positions: defaultPositions(parts, structuredClone(v?.positions ?? {})),
            wires: (v?.wires ?? []).filter(([a, b]) => terminalExists(a) && terminalExists(b)).map(w => [...w])
        };
        for (const p of allParts) clampPosition(p.id);
    };

    const terminalPosition = (key) => {
        const [id, pin] = key.split(".");
        const pos = state.positions[id];
        const [ox, oy] = pinOffset(byId[id].type, pin, pos.rot);
        return [pos.x + ox, pos.y + oy];
    };
    const toStagePoint = (e) => {
        const r = stage.getBoundingClientRect();
        return {x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale};
    };

    /** Half width and height of a part as it is drawn (rotation swaps them). */
    const extents = (id) => {
        const def = PARTS[byId[id].type], rot = state.positions[id].rot;
        return (rot === 90 || rot === 270) ? [def.height / 2, def.width / 2] : [def.width / 2, def.height / 2];
    };
    /** Keep a part completely on the canvas. */
    const clampPosition = (id) => {
        const pos = state.positions[id], [hw, hh] = extents(id);
        pos.x = Math.min(CANVAS.width - hw - 2, Math.max(hw + 2, pos.x));
        pos.y = Math.min(CANVAS.height - hh - 2, Math.max(hh + 2, pos.y));
    };
    const rotatePart = (id, by) => {
        if (!id || id === NANO) return;
        const pos = state.positions[id];
        pos.rot = (pos.rot + by + 360) % 360;
        clampPosition(id);
        changed();
    };

    const updateRoutes = () => {
        const boxes = allParts.map(p => {
            const pos = state.positions[p.id], [hw, hh] = extents(p.id);
            return [pos.x - hw, pos.y - hh, pos.x + hw, pos.y + hh];
        });
        const pins = allParts.flatMap(p => Object.keys(PARTS[p.type].pins).map(pin => terminalPosition(`${p.id}.${pin}`)));

        // wires that are (indirectly) connected form a net; they may share a track
        const parent = {};
        const find = (x) => parent[x] === undefined || parent[x] === x ? x : (parent[x] = find(parent[x]));
        parent[`${NANO}.GND2`] = `${NANO}.GND`;
        for (const [a, b] of state.wires) parent[find(a)] = find(b);
        const nets = new Map();
        const netOf = (t) => {
            const root = find(t);
            if (!nets.has(root)) nets.set(root, nets.size);
            return nets.get(root);
        };

        routes = routeWires(state.wires.map(([a, b]) => {
            const [ida, pina] = a.split("."), [idb, pinb] = b.split(".");
            return {
                a: terminalPosition(a), b: terminalPosition(b), net: netOf(a),
                dirA: exitDirection(byId[ida].type, pina, state.positions[ida].rot),
                dirB: exitDirection(byId[idb].type, pinb, state.positions[idb].rot)
            };
        }), boxes, pins);
    };
    const straightPath = ([x1, y1], [x2, y2]) => {
        const mx = (x1 + x2) / 2;
        return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    };
    const wireD = (w, i) => {
        const attached = drag && (w[0].startsWith(`${drag.id}.`) || w[1].startsWith(`${drag.id}.`));
        if (!routes[i] || attached) return straightPath(terminalPosition(w[0]), terminalPosition(w[1]));
        return routes[i].map((p, k) => `${k ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    };
    const wireColor = ([a, b], i) =>
        [a, b].includes(`${NANO}.5V`) ? "#e03131" :
        [a, b].some(t => t === `${NANO}.GND` || t === `${NANO}.GND2`) ? "#212529" : WIRE_COLORS[i % WIRE_COLORS.length];

    const renderOverlay = () => {
        const connected = new Set(state.wires.flat());
        let html = "";

        // labels
        for (const p of allParts) {
            if (p.type === "nano") continue;
            const pos = state.positions[p.id], def = PARTS[p.type];
            const half = (pos.rot === 90 || pos.rot === 270) ? def.width / 2 : def.height / 2;
            const above = pos.y - half - 3;
            html += `<text x="${pos.x}" y="${above < 8 ? pos.y + half + 7 : above}" class="part-label">${partLabel(p)}</text>`;
        }

        // wires (the selected one last, so it is on top)
        const order = state.wires.map((_w, i) => i).filter(i => i !== selectedWire);
        if (state.wires[selectedWire]) order.push(selectedWire);
        for (const i of order) {
            const w = state.wires[i], d = wireD(w, i);
            html += `<path d="${d}" class="wire ${i === selectedWire ? "selected" : ""}" stroke="${wireColor(w, i)}"/>
              <path d="${d}" class="wire-hit" data-wire="${i}"/>`;
        }

        // pins
        for (const p of allParts) {
            for (const pin of Object.keys(PARTS[p.type].pins)) {
                const key = `${p.id}.${pin}`;
                const [x, y] = terminalPosition(key);
                const title = p.type === "nano" ? `Arduino ${pin === "GND2" ? "GND" : pin}` : `${p.id} ${TERMINAL_NAMES[pin] ?? pin}`;
                html += `<g data-term="${key}" class="term ${connected.has(key) ? "connected" : ""} ${wiring?.from === key ? "active" : ""}">
                  <circle cx="${x}" cy="${y}" r="4.6" class="term-hit"/><circle cx="${x}" cy="${y}" r="2.1" class="term-dot"/>
                  <title>${title}</title></g>`;
            }
        }

        if (wiring) html += `<path d="${straightPath(terminalPosition(wiring.from), [wiring.x, wiring.y])}" class="wire rubber"/>`;

        if (state.wires[selectedWire] && !readOnly) {
            const route = routes[selectedWire] ?? state.wires[selectedWire].map(terminalPosition);
            const a = route[Math.floor((route.length - 1) / 2)], b = route[Math.ceil((route.length - 1) / 2)];
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            html += `<g data-del="1" class="wire-delete"><circle cx="${mx}" cy="${my}" r="5.5"/>
              <path d="M ${mx - 2.2} ${my - 2.2} L ${mx + 2.2} ${my + 2.2} M ${mx + 2.2} ${my - 2.2} L ${mx - 2.2} ${my + 2.2}"/>
              <title>Draad verwijderen</title></g>`;
        }

        if (sim) {
            for (const id of sim.burned) { // smoke
                if (!state.positions[id]) continue;
                const pos = state.positions[id], [, hh] = extents(id);
                html += `<g class="smoke" transform="translate(${pos.x} ${pos.y - hh + 2})">${[0, 1, 2].map(k => `
                  <circle cx="${(k - 1) * 3}" cy="0" r="2.5"><animate attributeName="cy" from="0" to="-24" dur="1.8s" begin="${k * 0.6}s" repeatCount="indefinite"/>
                  <animate attributeName="r" from="3" to="9" dur="1.8s" begin="${k * 0.6}s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" from="0.9" to="0" dur="1.8s" begin="${k * 0.6}s" repeatCount="indefinite"/></circle>`).join("")}</g>`;
            }
            for (const n of sim.damagedPins) {
                const key = `${NANO}.${n < 14 ? `D${n}` : `A${n - 14}`}`;
                if (!terminalExists(key)) continue;
                const [x, y] = terminalPosition(key);
                html += `<circle cx="${x}" cy="${y}" r="4" class="pin-damage"><animate attributeName="r" values="3;7;3" dur="0.8s" repeatCount="indefinite"/></circle>`;
            }
            for (const n of sim.floating) {
                const key = `${NANO}.${n < 14 ? `D${n}` : `A${n - 14}`}`;
                if (!terminalExists(key)) continue;
                const [x, y] = terminalPosition(key);
                const up = y < state.positions[NANO].y;
                html += `<g class="pin-floating" transform="translate(${x} ${y + (up ? -11 : 11)})"><circle r="5"/><text y="2.3">?</text></g>`;
            }
            if (sim.short) {
                const pos = state.positions[NANO], [hw, hh] = extents(NANO);
                html += `<rect x="${pos.x - hw - 4}" y="${pos.y - hh - 4}" width="${2 * hw + 8}" height="${2 * hh + 8}" rx="4" class="short-flash">
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.5s" repeatCount="indefinite"/></rect>`;
            }
        }

        if (selectedPart && !readOnly && !drag) {
            const pos = state.positions[selectedPart], [hw, hh] = extents(selectedPart);
            html += `<rect x="${pos.x - hw - 3}" y="${pos.y - hh - 3}" width="${2 * hw + 6}" height="${2 * hh + 6}" rx="3" class="part-selection"/>`;
            if (selectedPart !== NANO) {
                const tx = Math.min(CANVAS.width - 26, pos.x + hw + 4), ty = Math.max(8, pos.y - hh - 4);
                const button = (x, dir, title) => `<g data-rotate="${dir}" class="rotate-button" transform="translate(${x} ${ty})">
                  <circle r="6.5"/><path d="${dir > 0 ? "M -2.6 -2.2 A 3.2 3.2 0 1 1 -3.1 1.4 M -2.6 -2.2 L -3.6 -4.4 M -2.6 -2.2 L -0.3 -2.8"
                    : "M 2.6 -2.2 A 3.2 3.2 0 1 0 3.1 1.4 M 2.6 -2.2 L 3.6 -4.4 M 2.6 -2.2 L 0.3 -2.8"}"/><title>${title}</title></g>`;
                html += button(tx, -90, "Linksom draaien (Shift+R)") + button(tx + 15, 90, "Rechtsom draaien (R)");
            }
        }

        overlay.innerHTML = html;
        root.classList.toggle("readonly", readOnly);
        root.classList.toggle("wiring", !!wiring);
    };

    const render = () => {
        placeParts();
        renderOverlay();
    };
    const scheduleRender = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            render();
        });
    };
    const changed = () => {
        updateRoutes();
        render();
        onChange(getValue());
    };
    const addWire = (a, b) => {
        if (a === b || state.wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
        state.wires.push([a, b]);
        selectedWire = -1;
    };
    const deleteSelected = () => {
        if (selectedWire < 0) return;
        state.wires.splice(selectedWire, 1);
        selectedWire = -1;
        changed();
    };

    root.addEventListener("pointerdown", e => {
        if (readOnly && onButton && e.button === 0) {
            const id = /** @type {Element} */ (e.target).closest("[data-part]")?.getAttribute("data-part");
            if (id && byId[id].type === "button") {
                holding = id;
                root.setPointerCapture(e.pointerId);
                partElements[id].firstElementChild.pressed = true;
                onButton(id, true);
            }
            return;
        }
        if (readOnly || e.button !== 0) return;
        const target = /** @type {Element} */ (e.target);
        const term = target.closest("[data-term]"), part = target.closest("[data-part]");
        const wire = target.closest("[data-wire]"), del = target.closest("[data-del]");
        const rot = target.closest("[data-rotate]");
        const pt = toStagePoint(e);
        root.focus({preventScroll: true});

        if (del) return deleteSelected();
        if (rot) return rotatePart(selectedPart, Number(rot.getAttribute("data-rotate")));
        if (!part) selectedPart = null;
        if (term) {
            const key = term.getAttribute("data-term");
            if (wiring && wiring.from !== key) { // second click of click-click wiring
                addWire(wiring.from, key);
                wiring = null;
                return changed();
            }
            wiring = {from: key, x: pt.x, y: pt.y, startX: pt.x, startY: pt.y, moved: false};
            selectedWire = -1;
            root.setPointerCapture(e.pointerId);
            return renderOverlay();
        }
        if (wire) {
            selectedWire = Number(wire.getAttribute("data-wire"));
            wiring = null;
            return renderOverlay();
        }
        if (part) {
            const id = part.getAttribute("data-part");
            drag = {id, dx: pt.x - state.positions[id].x, dy: pt.y - state.positions[id].y, moved: false};
            selectedPart = id;
            selectedWire = -1;
            wiring = null;
            root.setPointerCapture(e.pointerId);
            return render();
        }
        selectedWire = -1;
        wiring = null;
        renderOverlay();
    });

    root.addEventListener("pointermove", e => {
        if (!drag && !wiring) return;
        const pt = toStagePoint(e);
        if (drag) {
            const pos = state.positions[drag.id];
            pos.x = Math.round((pt.x - drag.dx) / 2.4) * 2.4;
            pos.y = Math.round((pt.y - drag.dy) / 2.4) * 2.4;
            clampPosition(drag.id);
            drag.moved = true;
        } else if (wiring) {
            wiring.x = pt.x;
            wiring.y = pt.y;
            if (Math.hypot(pt.x - wiring.startX, pt.y - wiring.startY) > 4) wiring.moved = true;
        }
        scheduleRender();
    });

    root.addEventListener("pointerup", e => {
        if (holding) {
            partElements[holding].firstElementChild.pressed = false;
            onButton?.(holding, false);
            holding = null;
            return;
        }
        if (drag) {
            const moved = drag.moved;
            drag = null;
            if (moved) changed();
            else render();
            return;
        }
        if (wiring && wiring.moved) { // end of drag wiring
            const key = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-term]")?.getAttribute("data-term");
            const from = wiring.from;
            wiring = null;
            if (key && key !== from) {
                addWire(from, key);
                return changed();
            }
            renderOverlay();
        }
        // a click on a pin without moving keeps `wiring` for click-click wiring
    });

    root.addEventListener("dblclick", e => {
        if (readOnly) return;
        const id = /** @type {Element} */ (e.target).closest("[data-part]")?.getAttribute("data-part");
        rotatePart(id, 90);
    });

    root.addEventListener("keydown", e => {
        if (readOnly) return;
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            deleteSelected();
        } else if (e.key.toLowerCase() === "r" && selectedPart && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            rotatePart(selectedPart, e.shiftKey ? -90 : 90);
        } else if (e.key === "Escape") {
            wiring = null;
            selectedWire = -1;
            selectedPart = null;
            renderOverlay();
        }
    });

    const getValue = () => structuredClone({positions: state.positions, wires: state.wires});

    setValue(value);
    updateRoutes();
    render();
    resize();

    return {
        element: root,
        getValue,
        setValue(v) {
            setValue(v);
            selectedWire = -1;
            wiring = null;
            updateRoutes();
            render();
        },
        /**
         * Show the state of a live simulation (lit LEDs, spinning motors, burned parts, ...), or null to stop.
         * @param {{on: Set<string>, burned: Set<string>, damagedPins: Set<number>, floating: Set<number>, short: boolean} | null} view
         */
        /** Let buttons be pressed (in read-only mode) and report it, or null to stop. */
        setButtonHandler(fn) {
            onButton = fn;
        },
        showSimulation(view) {
            const key = view ? JSON.stringify([[...view.on], [...view.burned], [...view.damagedPins], [...view.floating], view.short]) : "";
            if (key === simKey) return;
            simKey = key;
            sim = view;
            root.classList.toggle("simulating", !!view);
            for (const p of allParts) {
                const wrapper = partElements[p.id], body = wrapper.firstElementChild;
                const on = !!view?.on.has(p.id);
                if (p.type === "led") body.value = on;
                if (p.type === "buzzer") body.hasSignal = on;
                wrapper.classList.toggle("on", on);
                wrapper.classList.toggle("burned", !!view?.burned.has(p.id));
            }
            renderOverlay();
        },
        setReadOnly(to) {
            readOnly = to;
            selectedWire = -1;
            selectedPart = null;
            wiring = null;
            renderOverlay();
        }
    };
};
