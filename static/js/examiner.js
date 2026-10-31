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
const typeNames = {dictee: "Dictee", topo: "Topo", rekenen: "Rekenen"};

const dicteeAnswerKeys = text => (text.match(/\{(.*?)\}/g) ?? []).map(a => a.slice(1, -1));
const roundPoints = r =>
  r.type === "dictee" ? dicteeAnswerKeys(r.text).length :
  r.type === "rekenen" ? sumLines(r.text).length :
  r.locations.length;

// keep in sync with `validateRound` in app/rounds.ts
const validateRound = (r) => {
    if (!r.title.trim()) return "er mist een titel";

    if (r.type === "dictee") {
        const open = (r.text.match(/\{/g) ?? []).length;
        const close = (r.text.match(/\}/g) ?? []).length;
        if (open !== close || /\{\s*\}/.test(r.text)) return "je syntax is niet helemaal lekker";
        if (dicteeAnswerKeys(r.text).length === 0) return "er zijn geen in te vullen woorden";
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

const saveRounds = () => {
    savePending = true;
    socket.emit("examiner-rounds-update", rounds);
};
saveButton.addEventListener("click", saveRounds);

const updateStatus = () => {
    const disableControls = !editable;
    addDicteeButton.disabled = addTopoButton.disabled = addRekenenButton.disabled = disableControls;
    roundList.querySelectorAll("input, button").forEach(el => el.disabled = disableControls);
    roundEditor.querySelectorAll("input, textarea, button:not(.keep-enabled)").forEach(el => el.disabled = disableControls);

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
    const round = type === "topo" ?
      {id: newID(), type, title: "", active: true, maxDistanceKm: 250, locations: []} :
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
    setTimeout(() => map.invalidateSize(), 0);

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
    if (centers.isValid()) map.fitBounds(centers, {padding: [40, 40], maxZoom: 6});

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
    document.getElementById("live-round-title").textContent =
      `${live.currentRound + 1}/${live.rounds.length}: ${round?.title ?? ""} (${typeNames[round?.type] ?? ""})`;

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
    if (e.key === "Escape" && dialog.current.id) dialog.close();
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
