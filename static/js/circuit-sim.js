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

// Simulation panel: runs a circuit in real time inside a (read-only) circuit editor and lists what goes wrong.
// Used on the results page, in the examiner's inspector and in the question editor.

import { createLiveSimulation } from "/static/js/circuit.js";

const escape = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const ICONS = {
    pause: `<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="#fff"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="#fff"/></svg>`,
    play: `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2 L14 8 L4 14 Z" fill="#fff"/></svg>`,
    restart: `<svg viewBox="0 0 16 16" width="15" height="15"><path d="M12.5 5.5 A5 5 0 1 0 13 9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M13.5 1.8 L13 5.8 L9 5.2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

/**
 * Create a simulation panel. Attach it to an editor with `run(editor, question)`, detach with `stop()`.
 * @param {{title?: string, hint?: string}} [options]
 */
export const createSimulationPanel = ({title = "Simulatie", hint} = {}) => {
    const panel = document.createElement("div");
    panel.className = "circuit-sim";
    panel.innerHTML = `
      <div class="circuit-sim-head"><h4></h4><span class="circuit-sim-time"></span>
        <button class="main-bg small sim-play keep-enabled" title="Pauzeren/afspelen"></button>
        <button class="main-bg small sim-restart keep-enabled" title="Opnieuw starten">${ICONS.restart}</button></div>
      <p class="circuit-sim-hint"></p>
      <ul class="circuit-sim-messages"></ul>`;
    panel.querySelector("h4").textContent = title;

    let sim = null, editor = null, time = 0, last = 0, playing = true, frame = 0, shownMessages = null;

    const update = (view) => {
        panel.querySelector(".sim-play").innerHTML = playing ? ICONS.pause : ICONS.play;
        panel.querySelector(".circuit-sim-time").textContent = `${(time / 1000).toFixed(1).replace(".", ",")} s`;
        if (!view) return;
        const messages = view.error ? [view.error] : view.messages;
        const key = messages.join("|");
        if (key === shownMessages) return;
        shownMessages = key;
        panel.querySelector(".circuit-sim-messages").innerHTML = messages.length ?
          messages.map(m => `<li>${escape(m)}</li>`).join("") : `<li class="ok">Geen problemen: er gaat niets kapot.</li>`;
    };
    const restart = () => {
        sim?.reset();
        time = 0;
        playing = true;
        shownMessages = null;
        update();
    };
    panel.querySelector(".sim-play").addEventListener("click", () => {
        playing = !playing;
        update();
    });
    panel.querySelector(".sim-restart").addEventListener("click", restart);

    const stop = () => {
        cancelAnimationFrame(frame);
        editor?.showSimulation(null);
        editor?.setButtonHandler(null);
        sim = editor = null;
    };

    return {
        element: panel,
        stop,
        get running() { return !!sim; },
        /**
         * Run the circuit currently in `circuitEditor` (which should be read-only).
         * @param {any} circuitEditor
         * @param {any} question needs `code` and `parts`
         */
        run(circuitEditor, question) {
            stop();
            editor = circuitEditor;
            sim = createLiveSimulation({tests: [], ...question}, editor.getValue());
            editor.setButtonHandler((id, down) => sim?.press(id, down));
            time = 0;
            playing = true;
            shownMessages = null;
            last = performance.now();
            const hasButtons = question.parts.some(p => p.type === "button");
            panel.querySelector(".circuit-sim-hint").textContent = hint ?? (hasButtons ?
              "De code draait nu echt. Klik op een drukknop en houd hem ingedrukt om hem in te drukken." :
              "De code draait nu echt: kijk wat de schakeling doet.");

            const tick = (now) => {
                if (!sim) return;
                if (!panel.isConnected || !editor.element.isConnected) return stop();
                const visible = editor.element.offsetParent !== null;
                if (playing && visible) time += Math.min(100, now - last);
                last = now;
                if (visible) {
                    const view = sim.step(time);
                    editor.showSimulation(view);
                    update(view);
                }
                frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
            update();
        }
    };
};
