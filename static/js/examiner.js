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

import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";
import { evaluateSum, sumLines, formatNumber } from "/static/js/calc.js";
import { PART_TYPES, LED_COLORS, sanitizeQuestion, validateQuestion, gradeCircuit, sanitizeCircuit, partLabel, newQuestionID } from "/static/js/circuit.js";
import { createCircuitEditor } from "/static/js/circuit-editor.js";
import { createSimulationPanel } from "/static/js/circuit-sim.js";

const socket = io();

// Display version
socket.on("dictee-version", v => document.getElementById("version").textContent = `v${v}`);

// Rounds
const roundList = document.getElementById("round-list");
const roundEditor = document.getElementById("round-editor");
const saveButton = document.getElementById("dictee-save");
const statusText = document.getElementById("dictee-contents-status");
const addDicteeButton = document.getElementById("round-add-dictee");
const addTopoButton = document.getElementById("round-add-topo");
const addRekenenButton = document.getElementById("round-add-rekenen");
const addCircuitButton = document.getElementById("round-add-circuit");

/** Rounds as edited on this page, possibly unsaved. */
let rounds = [];
/** Rounds as stored on the server, used to inspect results. */
let savedRounds = [];
let selectedID = null;
let editable = false;
let dirty = false;
let savePending = false;
let editorMap = null;
let latestSearch = "";

const newID = () => Math.random().toString(36).slice(2, 10);
const typeNames = {dictee: "Dictee", topo: "Topo", rekenen: "Rekenen", circuit: "Arduino"};

const dicteeAnswerKeys = text => (text.match(/\{(.*?)\}/g) ?? []).map(a => a.slice(1, -1));
const roundPoints = r =>
  r.type === "dictee" ? dicteeAnswerKeys(r.text).length :
  r.type === "rekenen" ? sumLines(r.text).length :
  r.type === "circuit" ? r.questions.length :
  r.locations.length;

// keep in sync with `validateRound` in app/rounds.ts
const validateRound = (r) => {
    if (!r.title.trim()) return "er mist een titel";

    if (r.type === "dictee") {
        const open = (r.text.match(/\{/g) ?? []).length;
        const close = (r.text.match(/\}/g) ?? []).length;
        if (open !== close || /\{\s*\}/.test(r.text)) return "je syntax is niet helemaal lekker";
        if (dicteeAnswerKeys(r.text).length === 0) return "er zijn geen in te vullen woorden";
    } else if (r.type === "circuit") {
        if (r.questions.length === 0) return "er zijn geen vragen";
        for (const [i, q] of r.questions.entries()) {
            const problem = validateQuestionCached(q);
            if (problem) return `bij vraag ${i + 1} ${problem}`;
        }
    } else if (r.type === "rekenen") {
        const lines = sumLines(r.text);
        if (lines.length === 0) return "er zijn geen sommen";
        for (const line of lines) {
            try {
                evaluateSum(line);
            } catch (err) {
                return `de som "${line}" klopt niet: ${err.message}`;
            }
        }
    } else {
        if (r.locations.length === 0) return "er zijn geen locaties";
        if (r.locations.some(l => !l.name.trim())) return "niet alle locaties hebben een naam";
    }
    return null;
};

// validating runs the model answer through the simulator, so remember the outcome per question content
const validationCache = new Map();
const validateQuestionCached = (q) => {
    const key = JSON.stringify(q);
    if (!validationCache.has(key)) {
        if (validationCache.size > 200) validationCache.clear();
        validationCache.set(key, validateQuestion(sanitizeQuestion(q)));
    }
    return validationCache.get(key);
};

const saveRounds = () => {
    savePending = true;
    socket.emit("examiner-rounds-update", rounds);
};
saveButton.addEventListener("click", saveRounds);

const updateStatus = () => {
    const disableControls = !editable;
    addDicteeButton.disabled = addTopoButton.disabled = addRekenenButton.disabled = addCircuitButton.disabled = disableControls;
    roundList.querySelectorAll("input, button").forEach(el => el.disabled = disableControls);
    roundEditor.querySelectorAll("input, textarea, select, button:not(.keep-enabled)").forEach(el => el.disabled = disableControls);

    if (!editable) {
        statusText.textContent = "Sluit het dictee af om de rondes te kunnen bewerken.";
        saveButton.disabled = true;
        return;
    }

    const active = rounds.filter(r => r.active);
    const points = active.reduce((sum, r) => sum + roundPoints(r), 0);
    const problem = rounds.map(r => [r, validateRound(r)]).find(([, p]) => p);

    let output = `${active.length} van de ${rounds.length} ${rounds.length === 1 ? "ronde" : "rondes"} actief, ` +
      `samen goed voor ${points} ${points === 1 ? "punt" : "punten"}`;
    if (problem) output += `, maar bij "${problem[0].title.trim() || typeNames[problem[0].type]}" ${problem[1]}.`;
    else if (active.length === 0) output += ". Zet minstens één ronde aan om het dictee te kunnen afnemen.";
    else output += ".";
    if (dirty) output += " Niet opgeslagen!";

    statusText.textContent = output;
    saveButton.disabled = !!problem || !dirty;
};

const markDirty = () => {
    dirty = true;
    renderList();
};

const renderList = () => {
    [...roundList.children].forEach(c => c.remove());

    rounds.forEach((r, i) => {
        const item = document.createElement("div");
        item.className = "round-item";
        item.classList.toggle("selected", r.id === selectedID);
        item.classList.toggle("inactive", !r.active);
        item.classList.toggle("invalid", !!validateRound(r));
        item.addEventListener("click", e => {
            if (e.target.closest("input, button") || r.id === selectedID) return;
            selectedID = r.id;
            renderList();
            renderEditor();
        });

        const active = document.createElement("input");
        active.type = "checkbox";
        active.checked = r.active;
        active.title = "Ronde actief";
        active.addEventListener("change", () => {
            r.active = active.checked;
            markDirty();
        });

        const label = document.createElement("div");
        label.className = "round-label";
        label.innerHTML = `<b></b><span></span>`;
        label.querySelector("b").textContent = r.title.trim() || "Zonder titel";
        label.querySelector("span").textContent =
          `${typeNames[r.type]} · ${roundPoints(r)} ${roundPoints(r) === 1 ? "punt" : "punten"}`;

        const controls = document.createElement("div");
        controls.className = "round-controls";
        const control = (icon, title, disabled, action, className = "") => {
            const b = document.createElement("button");
            b.className = `small ${className}`;
            b.title = title;
            b.disabled = disabled;
            b.innerHTML = `<img src="/static/icons/${icon}.svg" alt="${title}">`;
            b.addEventListener("click", () => action(b));
            controls.appendChild(b);
        };
        const move = (to) => {
            rounds.splice(to, 0, ...rounds.splice(i, 1));
            markDirty();
        };
        control("arrow-right", "Omhoog", i === 0, () => move(i - 1), "rot-up");
        control("arrow-right", "Omlaag", i === rounds.length - 1, () => move(i + 1), "rot-down");
        control("x", "Verwijderen", false, (b) => {
            if (!b.classList.contains("confirm-warning")) {
                b.classList.add("confirm-warning");
                return;
            }
            rounds.splice(i, 1);
            if (selectedID === r.id) selectedID = rounds[Math.min(i, rounds.length - 1)]?.id ?? null;
            markDirty();
            renderEditor();
        }, "red-bg");

        item.append(active, label, controls);
        roundList.appendChild(item);
    });

    if (rounds.length === 0) {
        const empty = document.createElement("p");
        empty.className = "round-empty";
        empty.textContent = "Nog geen rondes.";
        roundList.appendChild(empty);
    }

    updateStatus();
};

const addRound = (type) => {
    const round = type === "topo" ? {id: newID(), type, title: "", active: true, maxDistanceKm: 250, locations: []} :
      type === "circuit" ? {id: newID(), type, title: "", active: true, questions: [newCircuitQuestion()]} :
      {id: newID(), type, title: "", active: true, text: ""};
    rounds.push(round);
    selectedID = round.id;
    markDirty();
    renderEditor();
    roundEditor.querySelector("input")?.focus();
};
addDicteeButton.addEventListener("click", () => addRound("dictee"));
addTopoButton.addEventListener("click", () => addRound("topo"));
addRekenenButton.addEventListener("click", () => addRound("rekenen"));
addCircuitButton.addEventListener("click", () => addRound("circuit"));

const field = (labelHTML, element) => {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-field";
    const p = document.createElement("p");
    p.innerHTML = labelHTML;
    wrapper.append(p, element);
    return wrapper;
};

const renderEditor = () => {
    editorMap?.remove();
    editorMap = null;
    [...roundEditor.children].forEach(c => c.remove());
    roundEditor.className = "";

    const round = rounds.find(r => r.id === selectedID);
    if (!round) {
        const p = document.createElement("p");
        p.className = "round-empty";
        p.textContent = "Voeg hierboven een dictee- of topografieronde toe.";
        roundEditor.appendChild(p);
        return;
    }
    roundEditor.classList.add(`editor-${round.type}`);

    const title = document.createElement("input");
    title.spellcheck = false;
    title.autocomplete = "off";
    title.value = round.title;
    title.addEventListener("input", () => {
        round.title = title.value;
        markDirty();
    });
    roundEditor.appendChild(field("<b>Titel:</b>", title));

    if (round.type === "dictee") renderDicteeEditor(round);
    else if (round.type === "rekenen") renderRekenenEditor(round);
    else if (round.type === "circuit") renderCircuitRoundEditor(round);
    else renderTopoEditor(round);
    updateStatus();
};

const renderDicteeEditor = (round) => {
    const textarea = document.createElement("textarea");
    textarea.spellcheck = false;
    textarea.value = round.text;
    textarea.addEventListener("input", () => {
        round.text = textarea.value;
        markDirty();
    });

    const wrapper = field("<b>Tekst:</b> <em>Woorden tussen {accolades} moeten kandidaten invullen.</em>", textarea);
    wrapper.classList.add("grow");
    roundEditor.appendChild(wrapper);
};

const renderRekenenEditor = (round) => {
    const columns = document.createElement("div");
    columns.className = "rekenen-editor";

    const textarea = document.createElement("textarea");
    textarea.spellcheck = false;
    textarea.placeholder = "12 × 7\n(3 + 4) * 2\n144 : 12";
    textarea.value = round.text;

    const preview = document.createElement("ol");
    preview.className = "rekenen-preview";
    const renderPreview = () => {
        [...preview.children].forEach(c => c.remove());
        for (const line of sumLines(round.text)) {
            const li = document.createElement("li");
            try {
                const sum = evaluateSum(line);
                li.innerHTML = `${htmlsp(sum.display)} = <b class="green-fg">${formatNumber(sum.value)}</b>`;
            } catch (err) {
                li.innerHTML = `${htmlsp(line)} <span class="red-fg">— ${htmlsp(err.message)}</span>`;
            }
            preview.appendChild(li);
        }
    };
    renderPreview();

    textarea.addEventListener("input", () => {
        round.text = textarea.value;
        renderPreview();
        markDirty();
    });

    columns.append(textarea, preview);
    const wrapper = field(
      "<b>Sommen:</b> <em>Eén som per regel, met + − × : ^ en haakjes. Het antwoord wordt automatisch berekend.</em>",
      columns
    );
    wrapper.classList.add("grow");
    roundEditor.appendChild(wrapper);
};

const newCircuitQuestion = () => ({
    id: newQuestionID(),
    task: "",
    code: "void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n}\n\nvoid loop() {\n}",
    parts: [{id: "LED1", type: "led", color: "rood"}, {id: "R1", type: "resistor", value: 220}],
    tests: [{name: "LED1 brandt", at: 100, inputs: {}, expect: {LED1: true}}],
    solution: {positions: {}, wires: []}
});

let circuitQuestionIndex = 0;
/** The model answer editor currently shown, if any. */
let solutionEditor = null;
/** The full screen question editor, if open: re-renders it (e.g. when the dictee state changes). */
let circuitModal = null;

/**
 * Overview of the questions in the round editor; each question is edited (or viewed) in a full screen editor.
 */
const renderCircuitRoundEditor = (round) => {
    const wrapper = document.createElement("div");
    wrapper.className = "circuit-round-editor";
    roundEditor.appendChild(wrapper);

    const list = document.createElement("div");
    list.className = "cq-list";
    round.questions.forEach((q, i) => {
        const problem = validateQuestionCached(q);
        const item = document.createElement("div");
        item.className = `cq-item ${problem ? "invalid" : ""}`;
        const outputs = q.parts.filter(p => PART_TYPES[p.type].output).length;
        item.innerHTML = `
          <div class="cq-item-number">${i + 1}</div>
          <div class="cq-item-info">
            <b></b>
            <span class="cq-item-meta">${q.parts.length} onderdelen · ${q.tests.length} ${q.tests.length === 1 ? "test" : "tests"} · ${outputs} uitgang${outputs === 1 ? "" : "en"}</span>
            <span class="cq-item-status ${problem ? "red-fg" : "green-fg"}"></span>
          </div>
          <div class="cq-item-buttons"></div>`;
        item.querySelector("b").textContent = q.task || "Nog geen opdracht";
        item.querySelector(".cq-item-status").textContent = problem ? `⚠ ${problem}` : "✓ Voorbeeldoplossing haalt alle tests";

        const buttons = item.querySelector(".cq-item-buttons");
        const open = document.createElement("button");
        open.className = "main-bg small keep-enabled";
        open.innerHTML = `<span>${editable ? "Bewerken" : "Bekijken"}</span>`;
        open.addEventListener("click", () => openCircuitModal(round, i));
        buttons.appendChild(open);

        const move = (to) => {
            round.questions.splice(to, 0, ...round.questions.splice(i, 1));
            markDirty();
            renderEditor();
        };
        const small = (icon, title, disabled, action, cls = "") => {
            const b = document.createElement("button");
            b.className = `small icon ${cls}`;
            b.title = title;
            b.disabled = disabled;
            b.innerHTML = `<img src="/static/icons/${icon}.svg" alt="${title}">`;
            b.addEventListener("click", () => action(b));
            buttons.appendChild(b);
        };
        small("arrow-right", "Omhoog", i === 0, () => move(i - 1), "rot-up");
        small("arrow-right", "Omlaag", i === round.questions.length - 1, () => move(i + 1), "rot-down");
        small("x", "Vraag verwijderen", round.questions.length <= 1, (b) => {
            if (!b.classList.contains("confirm-warning")) return b.classList.add("confirm-warning");
            round.questions.splice(i, 1);
            markDirty();
            renderEditor();
        }, "red-bg");

        item.addEventListener("dblclick", e => {
            if (!e.target.closest("button")) openCircuitModal(round, i);
        });
        list.appendChild(item);
    });
    wrapper.appendChild(list);

    const add = document.createElement("button");
    add.className = "main-bg small cq-add";
    add.innerHTML = "<span>+ Vraag toevoegen</span>";
    add.addEventListener("click", () => {
        round.questions.push(newCircuitQuestion());
        markDirty();
        renderEditor();
        openCircuitModal(round, round.questions.length - 1);
    });
    wrapper.appendChild(add);
    updateStatus();
};

const openCircuitModal = (round, index) => {
    closeCircuitModal();
    circuitQuestionIndex = index;

    const modal = document.createElement("div");
    modal.className = "cq-modal";
    modal.innerHTML = `
      <div class="cq-window">
        <header class="cq-header">
          <div class="cq-title"><h2></h2><span class="cq-mode"></span></div>
          <div class="cq-nav">
            <button class="main-bg small cq-step cq-prev"><img src="/static/icons/arrow-right.svg" alt="" class="img-r rot180"><span>Vorige</span></button>
            <div class="cq-tabs"></div>
            <button class="main-bg small cq-step cq-next"><span>Volgende</span><img src="/static/icons/arrow-right.svg" alt="" class="img-r"></button>
          </div>
          <button class="cq-close" title="Sluiten (Esc)"><img src="/static/icons/x.svg" alt="Sluiten"></button>
        </header>
        <div class="cq-body">
          <div class="cq-form"></div>
          <div class="cq-preview"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    modal.querySelector(".cq-close").addEventListener("click", closeCircuitModal);
    modal.addEventListener("pointerdown", e => {
        if (e.target === modal) closeCircuitModal();
    });

    const render = () => {
        circuitQuestionIndex = Math.min(circuitQuestionIndex, round.questions.length - 1);
        const q = round.questions[circuitQuestionIndex];
        modal.querySelector(".cq-title h2").textContent = round.title || "Arduino-ronde";
        modal.querySelector(".cq-mode").textContent = editable ? "" : "Alleen bekijken: sluit het dictee af om te bewerken";

        const tabs = modal.querySelector(".cq-tabs");
        tabs.innerHTML = "";
        round.questions.forEach((question, i) => {
            const tab = document.createElement("button");
            const problem = validateQuestionCached(question);
            tab.className = `cq-tab ${i === circuitQuestionIndex ? "selected" : ""} ${problem ? "bad" : "good"}`;
            tab.innerHTML = `<span class="cq-tab-mark">${problem ? "!" : "✓"}</span>Vraag ${i + 1}`;
            tab.title = problem ?? question.task;
            tab.addEventListener("click", () => {
                circuitQuestionIndex = i;
                render();
            });
            tabs.appendChild(tab);
        });
        modal.querySelector(".cq-prev").disabled = circuitQuestionIndex === 0;
        modal.querySelector(".cq-next").disabled = circuitQuestionIndex === round.questions.length - 1;
        modal.querySelector(".cq-prev").onclick = () => { circuitQuestionIndex--; render(); };
        modal.querySelector(".cq-next").onclick = () => { circuitQuestionIndex++; render(); };

        const form = modal.querySelector(".cq-form"), preview = modal.querySelector(".cq-preview");
        const scroll = form.scrollTop;
        form.innerHTML = "";
        preview.innerHTML = "";
        renderCircuitQuestion(q, form, render, preview, () => {
            // keep the tab marks in sync with the live check
            const tab = tabs.children[circuitQuestionIndex];
            const problem = validateQuestionCached(q);
            tab.className = `cq-tab selected ${problem ? "bad" : "good"}`;
            tab.querySelector(".cq-tab-mark").textContent = problem ? "!" : "✓";
        });
        form.scrollTop = scroll;
    };
    circuitModal = {element: modal, render};
    render();
};

const closeCircuitModal = () => {
    if (!circuitModal) return;
    circuitModal.element.remove();
    circuitModal = null;
    solutionEditor = null;
    document.body.style.overflow = "";
    renderEditor(); // refresh the overview
};

const renderCircuitQuestion = (q, wrapper, renderAll, preview = wrapper, onCheck = () => {}) => {
    const status = document.createElement("div");
    status.className = "circuit-check";
    const check = () => {
        const problem = validateQuestionCached(q);
        status.className = `circuit-check ${problem ? "red-fg" : "green-fg"}`;
        status.textContent = problem ? `Let op: ${problem}.` : "✓ De voorbeeldoplossing haalt alle tests.";
        onCheck();
    };
    let checkTimeout = null;
    const changed = () => {
        markDirty();
        clearTimeout(checkTimeout);
        checkTimeout = setTimeout(check, 250);
    };

    // task
    const task = document.createElement("textarea");
    task.rows = 3;
    task.value = q.task;
    task.addEventListener("input", () => {
        q.task = task.value;
        changed();
    });
    wrapper.appendChild(field("<b>Opdracht:</b> <em>Wat moet de schakeling doen? Dit zien de kandidaten.</em>", task));

    // code
    const code = document.createElement("textarea");
    code.className = "code-input";
    code.rows = 10;
    code.spellcheck = false;
    code.value = q.code;
    code.addEventListener("input", () => {
        q.code = code.value;
        changed();
    });
    code.addEventListener("keydown", e => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        code.setRangeText("  ", code.selectionStart, code.selectionEnd, "end");
        q.code = code.value;
        changed();
    });
    wrapper.appendChild(field("<b>Arduino-code:</b> <em>Vaste code op de Nano (C++), kandidaten kunnen hem niet aanpassen.</em>", code));

    // parts
    const partsBox = document.createElement("div");
    partsBox.className = "circuit-parts";
    q.parts.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "circuit-part-row";

        const id = document.createElement("input");
        id.value = p.id;
        id.className = "part-id";
        id.addEventListener("change", () => {
            const to = id.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
            renamePart(q, p.id, to);
            markDirty();
            renderAll();
        });
        const type = document.createElement("span");
        type.textContent = PART_TYPES[p.type].name;

        row.append(id, type);
        if (p.type === "resistor") {
            const value = document.createElement("input");
            value.type = "number";
            value.min = "1";
            value.value = p.value;
            value.title = "Weerstand in ohm";
            value.addEventListener("input", () => {
                if (+value.value > 0) p.value = +value.value;
                changed();
            });
            row.append(value, document.createTextNode("Ω"));
        }
        if (p.type === "led") {
            const color = document.createElement("select");
            for (const c of Object.keys(LED_COLORS)) color.add(new Option(c, c, false, c === p.color));
            color.addEventListener("change", () => {
                p.color = color.value;
                markDirty();
                renderAll();
            });
            row.appendChild(color);
        }
        const remove = document.createElement("button");
        remove.className = "red-bg small icon";
        remove.title = "Onderdeel verwijderen";
        remove.innerHTML = `<img src="/static/icons/x.svg" alt="Verwijderen">`;
        remove.addEventListener("click", () => {
            q.parts.splice(i, 1);
            renamePart(q, p.id, null);
            markDirty();
            renderAll();
        });
        row.appendChild(remove);
        partsBox.appendChild(row);
    });
    const addRow = document.createElement("div");
    addRow.className = "circuit-part-row";
    const addType = document.createElement("select");
    for (const [type, def] of Object.entries(PART_TYPES)) addType.add(new Option(def.name, type));
    const addPart = document.createElement("button");
    addPart.className = "main-bg small";
    addPart.innerHTML = "<span>+ Onderdeel</span>";
    addPart.addEventListener("click", () => {
        const def = PART_TYPES[addType.value];
        let n = 1;
        while (q.parts.some(p => p.id === `${def.prefix}${n}`)) n++;
        const part = {id: `${def.prefix}${n}`, type: addType.value};
        if (part.type === "resistor") part.value = 220;
        if (part.type === "led") part.color = "rood";
        q.parts.push(part);
        markDirty();
        renderAll();
    });
    addRow.append(addType, addPart);
    partsBox.appendChild(addRow);
    wrapper.appendChild(field("<b>Onderdelen:</b> <em>Deze krijgen kandidaten om mee te bouwen (extra onderdelen als afleiding mag).</em>", partsBox));

    // tests
    const buttons = q.parts.filter(p => PART_TYPES[p.type].input);
    const outputs = q.parts.filter(p => PART_TYPES[p.type].output);
    const testsBox = document.createElement("div");
    testsBox.className = "circuit-tests-editor";
    q.tests.forEach((t, i) => {
        const row = document.createElement("div");
        row.className = "circuit-test-row";

        const name = document.createElement("input");
        name.value = t.name;
        name.placeholder = "Naam van de test";
        name.addEventListener("input", () => {
            t.name = name.value;
            changed();
        });
        const at = document.createElement("input");
        at.type = "number";
        at.min = "1";
        at.value = t.at;
        at.title = "Moment van controleren, in milliseconden na het starten";
        at.addEventListener("input", () => {
            if (+at.value > 0) t.at = +at.value;
            changed();
        });
        row.append(name, at, document.createTextNode("ms"));

        if (buttons.length) {
            const pressed = document.createElement("span");
            pressed.className = "test-group";
            pressed.textContent = "Ingedrukt:";
            for (const b of buttons) {
                const label = document.createElement("label");
                const box = document.createElement("input");
                box.type = "checkbox";
                box.checked = !!t.inputs[b.id];
                box.addEventListener("change", () => {
                    if (box.checked) t.inputs[b.id] = true;
                    else delete t.inputs[b.id];
                    changed();
                });
                label.append(box, ` ${b.id}`);
                pressed.appendChild(label);
            }
            row.appendChild(pressed);
        }

        const expect = document.createElement("span");
        expect.className = "test-group";
        expect.textContent = "Verwacht:";
        for (const o of outputs) {
            const label = document.createElement("label");
            const select = document.createElement("select");
            for (const [v, text] of [["", "—"], ["true", "aan"], ["false", "uit"]])
                select.add(new Option(text, v, false, String(t.expect[o.id] ?? "") === v));
            select.addEventListener("change", () => {
                if (select.value === "") delete t.expect[o.id];
                else t.expect[o.id] = select.value === "true";
                changed();
            });
            label.append(`${o.id} `, select);
            expect.appendChild(label);
        }
        row.appendChild(expect);

        const remove = document.createElement("button");
        remove.className = "red-bg small icon";
        remove.title = "Test verwijderen";
        remove.innerHTML = `<img src="/static/icons/x.svg" alt="Verwijderen">`;
        remove.addEventListener("click", () => {
            q.tests.splice(i, 1);
            markDirty();
            renderAll();
        });
        row.appendChild(remove);
        testsBox.appendChild(row);
    });
    const addTest = document.createElement("button");
    addTest.className = "main-bg small";
    addTest.innerHTML = "<span>+ Test</span>";
    addTest.addEventListener("click", () => {
        q.tests.push({name: `Test ${q.tests.length + 1}`, at: 100, inputs: {}, expect: {}});
        markDirty();
        renderAll();
    });
    testsBox.appendChild(addTest);
    wrapper.appendChild(field("<b>Tests:</b> <em>Per test: welke knoppen ingedrukt zijn en wat er na zoveel ms aan of uit moet zijn. " +
      "Alle tests goed = 1 punt.</em>", testsBox));

    // model answer
    const solutionArea = document.createElement("div");
    solutionArea.className = "circuit-solution";
    preview.appendChild(field("<b>Voorbeeldoplossing</b> <em>Bouw een werkende schakeling; daarmee wordt de vraag gecontroleerd.</em>", solutionArea));
    solutionEditor = createCircuitEditor(solutionArea, {
        parts: q.parts,
        value: q.solution,
        readOnly: !editable,
        onChange: (v) => {
            q.solution = v;
            changed();
        }
    });
    const editor = solutionEditor;
    preview.appendChild(status);
    check();

    // simulate the model answer; the editor is read-only while simulating, so buttons can be pressed
    const simulation = createSimulationPanel({title: "Simulatie van de voorbeeldoplossing"});
    const simToggle = document.createElement("button");
    simToggle.className = "main-bg small sim-start keep-enabled";
    const setSimulating = (on) => {
        if (on) {
            editor.setReadOnly(true);
            simToggle.after(simulation.element);
            simulation.run(editor, q);
        } else {
            simulation.stop();
            simulation.element.remove();
            editor.setReadOnly(!editable);
        }
        simToggle.innerHTML = `<span>${on ? "■ Stoppen met simuleren" : "▶ Simuleren"}</span>`;
        simToggle.classList.toggle("red-bg", on);
        simToggle.classList.toggle("main-bg", !on);
    };
    simToggle.addEventListener("click", () => setSimulating(!simulation.running));
    preview.appendChild(simToggle);
    setSimulating(false);

    if (!editable) wrapper.querySelectorAll("input, textarea, select, button:not(.keep-enabled)").forEach(el => el.disabled = true);
};

/** Rename (or with `to` = null: remove) a part in the tests and model answer of a question. */
const renamePart = (q, from, to) => {
    if (from === to) return;
    for (const t of q.tests) {
        for (const map of [t.inputs, t.expect]) {
            if (!(from in map)) continue;
            if (to) map[to] = map[from];
            delete map[from];
        }
    }
    const part = q.parts.find(p => p.id === from);
    if (part && to) part.id = to;
    const rewrite = (key) => key.startsWith(`${from}.`) ? (to ? `${to}${key.slice(from.length)}` : null) : key;
    q.solution.wires = q.solution.wires.map(w => w.map(rewrite)).filter(w => w[0] && w[1]);
    if (q.solution.positions[from]) {
        if (to) q.solution.positions[to] = q.solution.positions[from];
        delete q.solution.positions[from];
    }
};

const renderTopoEditor = (round) => {
    const distance = document.createElement("input");
    distance.type = "number";
    distance.min = "1";
    distance.step = "10";
    distance.value = round.maxDistanceKm;
    distance.addEventListener("input", () => {
        if (+distance.value > 0) {
            round.maxDistanceKm = +distance.value;
            markDirty();
        }
    });
    roundEditor.appendChild(field(
      "<b>Max. afstand (km):</b> <em>Binnen de grens = 1 punt, daarbuiten aflopend tot 0 punten op deze afstand. " +
        "Plekken zonder grens (bijv. bergtoppen) gelden tot 1/20 van deze afstand als goed.</em>",
      distance
    ));

    // search
    const searchRow = document.createElement("div");
    searchRow.className = "location-search";
    const searchInput = document.createElement("input");
    searchInput.placeholder = "Zoek een land, provincie, stad, rivier...";
    searchInput.spellcheck = false;
    searchInput.autocomplete = "off";
    const searchButton = document.createElement("button");
    searchButton.className = "main-bg small";
    searchButton.innerHTML = "<span>Zoeken</span>";
    searchRow.append(searchInput, searchButton);

    const results = document.createElement("div");
    results.id = "location-results";

    const search = () => {
        const q = searchInput.value.trim();
        if (!q) return;
        latestSearch = q;
        results.innerHTML = `<p class="round-empty">Zoeken naar "${htmlsp(q)}"...</p>`;
        socket.emit("examiner-location-search", q);
    };
    searchButton.addEventListener("click", search);
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            search();
        }
    });
    roundEditor.appendChild(field("<b>Locatie toevoegen:</b> <em>Gegevens van OpenStreetMap.</em>", searchRow));
    roundEditor.appendChild(results);

    // locations + map
    const body = document.createElement("div");
    body.className = "topo-editor-body";
    const list = document.createElement("div");
    list.className = "location-list";
    const mapElement = document.createElement("div");
    mapElement.className = "topo-map";
    body.append(list, mapElement);
    roundEditor.appendChild(body);

    const map = editorMap = topo.createMap(mapElement, true);
    const locationLayers = L.layerGroup().addTo(map);
    const previewLayer = L.layerGroup().addTo(map);
    setTimeout(() => {
        if (editorMap === map) map.invalidateSize(); // the editor may have been re-rendered meanwhile
    }, 0);

    const focus = (location) => {
        const bounds = topo.geometryLayer(location.geometry).getBounds();
        // outlines with far away territories (e.g. France) would zoom out to the whole world
        if (bounds.isValid() && bounds.getEast() - bounds.getWest() < 60)
            map.flyToBounds(bounds, {padding: [30, 30], maxZoom: 10, duration: 0.6});
        else
            map.flyTo([location.lat, location.lng], 5, {duration: 0.6});
    };

    const renderLocations = () => {
        locationLayers.clearLayers();
        [...list.children].forEach(c => c.remove());

        round.locations.forEach((l, i) => {
            topo.geometryLayer(l.geometry, topo.colors.location)
              .bindTooltip(`${i + 1}. ${htmlsp(l.name)}`, {sticky: true})
              .addTo(locationLayers);

            const item = document.createElement("div");
            item.className = "location-item";

            const number = document.createElement("b");
            number.textContent = `${i + 1}.`;

            const info = document.createElement("div");
            const name = document.createElement("input");
            name.value = l.name;
            name.spellcheck = false;
            name.title = "Naam die kandidaten te zien krijgen";
            name.addEventListener("input", () => {
                l.name = name.value;
                markDirty();
            });
            const description = document.createElement("small");
            description.textContent = l.description;
            description.title = l.description;
            info.append(name, description);

            const view = document.createElement("button");
            view.className = "main-bg small keep-enabled";
            view.title = "Bekijken";
            view.innerHTML = `<img src="/static/icons/eye.svg" alt="Bekijken">`;
            view.addEventListener("click", () => focus(l));

            const remove = document.createElement("button");
            remove.className = "red-bg small";
            remove.title = "Verwijderen";
            remove.innerHTML = `<img src="/static/icons/x.svg" alt="Verwijderen">`;
            remove.addEventListener("click", () => {
                round.locations.splice(i, 1);
                markDirty();
                renderLocations();
            });

            item.append(number, info, view, remove);
            list.appendChild(item);
        });

        if (round.locations.length === 0) {
            const empty = document.createElement("p");
            empty.className = "round-empty";
            empty.textContent = "Nog geen locaties. Zoek hierboven naar een plaats om hem toe te voegen.";
            list.appendChild(empty);
        }
    };
    renderLocations();

    const centers = L.latLngBounds(round.locations.map(l => [l.lat, l.lng]));
    if (centers.isValid()) map.fitBounds(centers, {padding: [40, 40], maxZoom: 6, animate: false});

    // called by the search reply handler
    roundEditor.showSearchResults = (found, err) => {
        [...results.children].forEach(c => c.remove());
        previewLayer.clearLayers();

        if (err || found.length === 0) {
            results.innerHTML = `<p class="round-empty">${err ? `Oei, zoeken mislukt: ${htmlsp(err)}` : "Niets gevonden."}</p>`;
            return;
        }

        for (const r of found) {
            const button = document.createElement("button");
            button.className = "search-result";
            button.innerHTML = `<b></b> <em></em><small></small>`;
            button.querySelector("b").textContent = r.name;
            button.querySelector("em").textContent = r.category;
            button.querySelector("small").textContent = r.description;
            button.disabled = !editable;

            button.addEventListener("mouseenter", () => {
                previewLayer.clearLayers();
                topo.geometryLayer(r.geometry, topo.colors.partial).addTo(previewLayer);
            });
            button.addEventListener("mouseleave", () => previewLayer.clearLayers());
            button.addEventListener("click", () => {
                round.locations.push({
                    id: newID(), name: r.name, description: r.description,
                    lat: r.lat, lng: r.lng, geometry: r.geometry
                });
                [...results.children].forEach(c => c.remove());
                previewLayer.clearLayers();
                searchInput.value = "";
                markDirty();
                renderLocations();
                focus(r);
                searchInput.focus();
            });
            results.appendChild(button);
        }
    };
};

socket.on("examiner-location-search-reply", (query, err, found) => {
    if (query !== latestSearch) return;
    roundEditor.showSearchResults?.(found, err);
});

socket.on("examiner-rounds", (r) => {
    savedRounds = r;
    if (dirty && !savePending) {
        sonner.show("Een andere examinator heeft de rondes aangepast. Sla op om die wijzigingen te overschrijven.", "alert-circle", "red-bg");
        return;
    }

    savePending = false;
    dirty = false;
    rounds = structuredClone(r);
    if (!rounds.some(x => x.id === selectedID)) selectedID = rounds[0]?.id ?? null;
    renderList();
    renderEditor();
    if (circuitModal) { // reconnect the open question editor to the saved data
        const round = rounds.find(x => x.id === selectedID && x.type === "circuit");
        const index = circuitQuestionIndex;
        closeCircuitModal();
        if (round) openCircuitModal(round, index);
    }
});

socket.on("examiner-rounds-update-reply", (err) => {
    if (err) {
        savePending = false;
        sonner.show(`Oei, er ging iets mis: ${err}`, "alert-circle", "red-bg");
    } else
        sonner.show("De rondes zijn succesvol opgeslagen!", "check-circle", "green-bg");
});

const setEditable = (to) => {
    if (editable === to) return;
    editable = to;
    renderList();
    renderEditor();
    circuitModal?.render();
};

// Participants
const participantList = document.getElementById("participant-list");
const noParticipants = document.getElementById("no-participants");
const inspectorRounds = document.getElementById("inspector-rounds");
let inspectorMaps = [];

const kickParticipant = (index) => socket.emit("examiner-kick", index);

const resultSummary = (result) =>
  `${topo.formatPoints(result.score)}/${result.total} = <strong>${htmlsp(result.grade)}</strong>`;

const viewResult = (e, participant) => {
    document.getElementById("comparison-name").textContent =
      `${participant.firstName} ${participant.lastName}`;
    document.getElementById("comparison-score").innerHTML =
      `<span class="${participant.result.passed ? "green-fg" : "red-fg"}">${resultSummary(participant.result)}</span>`;

    inspectorMaps.forEach(m => m.remove());
    inspectorMaps = [];
    [...inspectorRounds.children].forEach(c => c.remove());
    const pendingMaps = [];

    for (const roundResult of participant.result.rounds) {
        const round = savedRounds.find(r => r.id === roundResult.roundID);
        const section = document.createElement("div");
        section.className = "inspector-round";
        const h3 = document.createElement("h3");
        h3.textContent = round?.title ?? "Verwijderde ronde";
        section.appendChild(h3);
        inspectorRounds.appendChild(section);

        if (!round || round.type !== roundResult.type) {
            section.insertAdjacentHTML("beforeend", `<p>Deze ronde is inmiddels aangepast of verwijderd.</p>`);
            continue;
        }

        if (round.type === "dictee") {
            const keys = dicteeAnswerKeys(round.text);
            const parts = htmlsp(round.text).replaceAll(/\{(.*?)\}/g, "{}").replaceAll("\n", "<br>").split("{}");
            let given = parts[0], correct = parts[0];
            roundResult.answers.forEach((a, i) => {
                given += `<span class="${a.correct ? "green-fg" : "red-fg"}">${nbsp(htmlsp(a.given))}</span>${parts[i + 1] ?? ""}`;
                correct += `<span class="green-fg">${nbsp(htmlsp(keys[i] ?? ""))}</span>${parts[i + 1] ?? ""}`;
            });

            section.insertAdjacentHTML("beforeend", `
              <div class="comparison">
                <div><h4>Gegeven antwoorden</h4><p>${given}</p></div>
                <div><h4>Juiste antwoorden</h4><p>${correct}</p></div>
              </div>`);
        } else if (round.type === "circuit") {
            round.questions.forEach((q, i) => {
                const answer = roundResult.answers[i];
                const box = document.createElement("div");
                box.className = "inspector-circuit";
                box.innerHTML = `<h4>Vraag ${i + 1}: <span class="${topo.scoreClass(answer?.score ?? 0)}">` +
                  `${answer?.score >= 1 ? "werkt (1 punt)" : "werkt niet (0 punten)"}</span></h4><p>${htmlsp(q.task)}</p>
                  <div class="inspector-circuit-body"><div class="inspector-circuit-side">
                  <ul class="circuit-tests">${(answer?.tests ?? []).map(t =>
                    `<li class="${t.passed ? "passed" : "failed"}"><b>${t.passed ? "✓" : "✗"} ${htmlsp(t.name)}</b>` +
                    `${t.passed ? "" : `<span>${htmlsp(t.message)}</span>`}</li>`).join("")}</ul></div></div>`;
                const area = document.createElement("div");
                area.className = "circuit-solution";
                box.querySelector(".inspector-circuit-body").appendChild(area);
                section.appendChild(box);

                // the simulation only starts on request: a dialog with many circuits should not run them all
                const simulation = createSimulationPanel({title: "Simulatie van deze schakeling"});
                const start = document.createElement("button");
                start.className = "main-bg small sim-start";
                start.innerHTML = "<span>▶ Simuleren</span>";
                box.querySelector(".inspector-circuit-side").appendChild(start);
                pendingMaps.push(() => {
                    const editor = createCircuitEditor(area, {parts: q.parts, value: answer?.given, readOnly: true});
                    start.addEventListener("click", () => {
                        start.replaceWith(simulation.element);
                        simulation.run(editor, q);
                    });
                });
            });
        } else if (round.type === "rekenen") {
            const sums = sumLines(round.text).map(line => {
                try { return evaluateSum(line); } catch { return {display: line, value: NaN}; }
            });
            let rows = "<tr><th>#</th><th>Som</th><th>Gegeven</th><th>Juist</th></tr>";
            roundResult.answers.forEach((a, i) => {
                rows += `<tr><td>${i + 1}</td><td>${htmlsp(sums[i]?.display ?? "")}</td>
                  <td class="${a.correct ? "green-fg" : "red-fg"}">${htmlsp(a.given)}</td>
                  <td class="green-fg">${formatNumber(sums[i]?.value)}</td></tr>`;
            });
            section.insertAdjacentHTML("beforeend", `<table class="inspector-table">${rows}</table>`);
        } else {
            const wrapper = document.createElement("div");
            wrapper.className = "inspector-topo";
            const table = document.createElement("table");
            const mapElement = document.createElement("div");
            mapElement.className = "topo-map";
            wrapper.append(table, mapElement);
            section.appendChild(wrapper);

            table.innerHTML = "<tr><th>#</th><th>Locatie</th><th>Afstand</th><th>Punten</th></tr>";
            round.locations.forEach((l, i) => {
                const a = roundResult.answers[i];
                table.insertAdjacentHTML("beforeend", `<tr>
                  <td>${i + 1}</td><td>${htmlsp(l.name)}</td>
                  <td>${a?.given ? (a.distanceKm === 0 ? "binnen" : topo.formatKm(a.distanceKm)) : "—"}</td>
                  <td class="${topo.scoreClass(a?.score ?? 0)}">${topo.formatPoints(a?.score ?? 0)}</td></tr>`);
            });

            pendingMaps.push(() => {
                const map = topo.createMap(mapElement, true);
                inspectorMaps.push(map);
                const layers = L.featureGroup().addTo(map);
                round.locations.forEach((l, i) => {
                    const a = roundResult.answers[i];
                    topo.geometryLayer(l.geometry, topo.colors.correct).bindTooltip(`${i + 1}. ${htmlsp(l.name)}`, {sticky: true}).addTo(layers);
                    if (!a?.given) return;
                    const color = topo.scoreColor(a.score);
                    if (a.nearest) L.polyline([a.given, a.nearest], {color, weight: 2, dashArray: "6 6"}).addTo(layers);
                    topo.clickMarker(a.given, color, i + 1).addTo(layers);
                });
                const bounds = round.locations.reduce((b, l, i) => b.extend(topo.resultBounds(l, roundResult.answers[i])), L.latLngBounds([]));
                if (bounds.isValid()) map.fitBounds(bounds, {padding: [40, 40], maxZoom: 8});
            });
        }
    }

    dialog.open("inspector", e.target);
    setTimeout(() => pendingMaps.forEach(f => f()), dialog.fadetime * 2 + 200);
};
document.getElementById("inspector-close").addEventListener("click", () => dialog.close());

/** The rounds being taken and the current one, see `liveState` in app/index.ts. */
let live = {rounds: [], currentRound: 0};
let lastParticipants = [[], {}];

/** Live status of a participant who has not handed in yet. */
const progressStatus = (participant, statusText) => {
    if (live.rounds.length === 0) {
        statusText.textContent = "Nog niet klaar";
        return;
    }
    const progress = participant.progress?.[live.currentRound];
    if (progress?.done) {
        statusText.className = "green-fg";
        statusText.textContent = `Klaar met ronde ${live.currentRound + 1} (${progress.filled}/${progress.total})`;
    } else {
        statusText.textContent = progress ?
          `Bezig met ronde ${live.currentRound + 1}: ${progress.filled}/${progress.total} ingevuld` :
          `Bezig met ronde ${live.currentRound + 1}`;
    }
};

const renderParticipants = (participants, left) => {
    [...participantList.children].forEach(c => c.remove());

    for (let i=0; i<participants.length; i++) {
        if (!participants[i]) continue;

        const statusText = document.createElement("span");
        if (participants[i].result) {
            statusText.className = (participants[i].result.passed) ? "green-fg" : "red-fg";
            statusText.innerHTML = resultSummary(participants[i].result);
        } else {
            progressStatus(participants[i], statusText);
        }

        const label = document.createElement("b");
        label.innerHTML = htmlsp(`${participants[i].firstName} ${participants[i].lastName}`) + `<em>#${i + 1}</em><br>`;
        label.innerHTML += statusText.outerHTML;

        const buttonWrapper = document.createElement("div");
        buttonWrapper.classList.add("button-wrapper");

        const viewButton = document.createElement("button");
        viewButton.classList.add("main-bg");
        viewButton.innerHTML = `<img src="/static/icons/eye.svg" alt="${htmlsp(participants[i].firstName)}'s results">`;
        viewButton.disabled = (!participants[i].result);
        viewButton.addEventListener("click", e => viewResult(e, participants[i]));

        const kickButton = document.createElement("button");
        kickButton.classList.add("red-bg");
        kickButton.innerHTML = `<img src="/static/icons/user-x.svg" alt="Kick ${htmlsp(participants[i].firstName)}">`;
        kickButton.addEventListener("click", () => {
            kickButton.classList.contains("confirm-warning") ? kickParticipant(i) : kickButton.classList.add("confirm-warning");
        });

        const cheatSum = Object.values(participants[i].cheats).reduce((accumulator, current) => accumulator + current, 0);
        if (cheatSum > 0) {
            const cheatOverview = document.createElement("div");
            cheatOverview.classList.add("cheats");
            for (const c of Object.keys(participants[i].cheats)) cheatOverview.innerHTML += `
              <div>
                <img src="/static/icons/${c}.svg" alt="${c}" title="${c}">
                <span>x${participants[i].cheats[c]}</span>
              </div>`;

            buttonWrapper.appendChild(cheatOverview);
        }

        buttonWrapper.appendChild(kickButton);
        buttonWrapper.appendChild(viewButton);

        const wrapper = document.createElement("p");
        wrapper.appendChild(label);
        wrapper.appendChild(buttonWrapper);

        participantList.appendChild(wrapper);
    }

    if (Object.keys(left).length > 0) {
        const participatingSocketIDs = participants.filter(p => p).map(p => p.socketID);

        if (participatingSocketIDs.length > 0 &&
          Object.keys(left).filter(l => participatingSocketIDs.includes(l)).length === 0) {
            participantList.appendChild(document.createElement("hr"));
        }

        for (const i of Object.keys(left)) {
            if (participatingSocketIDs.includes(i)) continue;

            const statusText = document.createElement("span");
            statusText.className = (left[i].result.passed) ? "green-fg" : "red-fg";
            statusText.innerHTML = resultSummary(left[i].result);

            const label = document.createElement("b");
            label.innerHTML = htmlsp(`${left[i].firstName} ${left[i].lastName}`) + "<br>";
            label.innerHTML += statusText.outerHTML;

            const viewButton = document.createElement("button");
            viewButton.classList.add("main-bg");
            viewButton.innerHTML = `<img src="/static/icons/eye.svg" alt="${htmlsp(left[i].firstName)}'s results">`;
            viewButton.addEventListener("click", e => viewResult(e, left[i]));

            const wrapper = document.createElement("p");
            wrapper.appendChild(label);
            wrapper.appendChild(viewButton);

            participantList.appendChild(wrapper);
        }
    }

    noParticipants.style.display = (participantList.children.length > 0) ? "none" : "";
};

socket.on("examiner-participants", (participants, left) => {
    lastParticipants = [participants, left];
    renderParticipants(participants, left);
    renderRoundControl();
});

// Round control: examiners decide which round participants are working on
const roundControl = document.getElementById("round-control");
const liveRoundPrev = document.getElementById("live-round-prev");
const liveRoundNext = document.getElementById("live-round-next");

const renderRoundControl = () => {
    roundControl.style.display = (live.rounds.length > 0) ? "" : "none";
    if (live.rounds.length === 0) return;

    const round = live.rounds[live.currentRound];
    document.getElementById("live-round-number").textContent = `${live.currentRound + 1}/${live.rounds.length}`;
    const title = document.getElementById("live-round-title");
    title.textContent = `${round?.title ?? ""} · ${typeNames[round?.type] ?? ""}`;
    title.title = title.textContent;

    // participants who handed in count as done
    const participants = lastParticipants[0].filter(p => p);
    const done = participants.filter(p => p.result || p.progress?.[live.currentRound]?.done).length;
    const doneLabel = document.getElementById("live-round-done");
    doneLabel.textContent = `${done} van ${participants.length} klaar`;
    doneLabel.className = (participants.length > 0 && done === participants.length) ? "green-fg" : "";

    liveRoundPrev.disabled = (live.currentRound === 0);
    liveRoundNext.disabled = (live.currentRound === live.rounds.length - 1);
};

liveRoundPrev.addEventListener("click", () => socket.emit("examiner-set-round", live.currentRound - 1));
liveRoundNext.addEventListener("click", () => socket.emit("examiner-set-round", live.currentRound + 1));

socket.on("examiner-live", (state) => {
    live = state;
    renderParticipants(...lastParticipants);
    renderRoundControl();
});

// Status
const stateLabel = document.getElementById("dictee-state");
const toClosed = document.getElementById("state-to-closed");
const toOpen = document.getElementById("state-to-open");
const toBusy = document.getElementById("state-to-busy");
const toEnded = document.getElementById("state-to-ended");

const lichtkrantAPIon = document.getElementById("lichtkrant-api-on");
const lichtkrantAPIoff = document.getElementById("lichtkrant-api-off");

toClosed.addEventListener("click", () => socket.emit("examiner-set-state", "closed"));
toOpen.addEventListener("click", () => socket.emit("examiner-set-state", "open"));
toBusy.addEventListener("click", () => socket.emit("examiner-set-state", "busy"));
toEnded.addEventListener("click", () => {
    if (!toEnded.classList.contains("confirm-warning")) {
        toEnded.classList.add("confirm-warning");
        toEnded.querySelector("span").textContent = "Zeker weten?";
        return;
    }
    socket.emit("examiner-set-state", "ended");
});

lichtkrantAPIon.addEventListener("click", () => socket.emit("examiner-set-lichtkrant-api", false));
lichtkrantAPIoff.addEventListener("click", () => socket.emit("examiner-set-lichtkrant-api", true));

socket.on("examiner-dashboard", (state, participantsIn, lichtkrantAPI, activeRounds) => {
    setEditable(state === "closed");
    toBusy.disabled = (activeRounds === 0);
    toBusy.title = (activeRounds === 0) ? "Er zijn geen (opgeslagen) actieve rondes" : "";

    toEnded.style.display = "none";
    toEnded.classList.remove("confirm-warning");
    toEnded.querySelector("span").textContent = "Beëindigen";

    if (state === "closed") {
        stateLabel.textContent = "Gesloten";
        stateLabel.className = "red-fg";

        toClosed.style.display = toBusy.style.display = "none";
        toOpen.style.display = "flex";

        if (dialog.current.id) {
            sonner.show("Het dictee is zojuist afgesloten.", "alert-circle", "red-bg");
            dialog.close(document.body);
        }
    } else if (state === "open" && participantsIn) {
        stateLabel.textContent = "Klaar voor start";
        stateLabel.className = "green-fg";

        toOpen.style.display = toClosed.style.display = "none";
        toBusy.style.display = "flex";
    } else if (state === "open") {
        stateLabel.textContent = "Geopend";
        stateLabel.className = "green-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = "flex";
    } else if (state === "busy") {
        stateLabel.textContent = "Aan het afnemen";
        stateLabel.className = "green-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = toEnded.style.display = "flex";
    } else if (state === "ended") {
        stateLabel.textContent = "Beëindigd";
        stateLabel.className = "orange-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = "flex";
    }

    lichtkrantAPIon.style.display = lichtkrantAPI ? "flex" : "";
    lichtkrantAPIoff.style.display = lichtkrantAPI ? "" : "flex";
    lichtkrantAPIoff.disabled = (state !== "busy" && state !== "ended");
});

// event handlers
const resizeParticipantList = () => {
    participantList.style.maxHeight =
      `${participantList.parentElement.clientHeight - 90}px`;
};

addEventListener("load", resizeParticipantList);
addEventListener("resize", resizeParticipantList);

addEventListener("keydown", e => {
    if (e.key === "Escape" && circuitModal) closeCircuitModal();
    else if (e.key === "Escape" && dialog.current.id) dialog.close();
    else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!saveButton.disabled) saveRounds();
    }
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    if (dialog.current.id) dialog.close();

    sonner.show("De server is ermee gekapt!", null, "red-bg");
});
