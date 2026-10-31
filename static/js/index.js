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

const socket = io();

const participateButton = document.getElementById("participate");
const participateStatus = document.getElementById("participation-state");
const participateUserCount = document.getElementById("participation-user-count");

const setParticipating = (to) => {
    document.querySelector(".Home").style.display = (to) ? "none" : "grid";
    document.querySelector(".Dictee").style.display = (to) ? "flex" : "none";

    shortDisableOverflow();
    onbeforeunload = (to) ? () => "Je kunt hier niet meer terugkomen als je refresht!" : null;

    if (!to) {
        socket.emit("leave");
        document.exitFullscreen().catch(() => {});
    }
};
const isParticipating = () => document.querySelector(".Home").style.display === "none";
const enforceAnticheats = () => isParticipating() || dialog.current.id === "waiting-room";

// Homepage
document.getElementById("rules-link").addEventListener("click", e => dialog.open("rules", e.target, false));
participateButton.addEventListener("click", () => dialog.open("rules", participateButton, true));

document.getElementById("rules-close").addEventListener("click", () => dialog.close());
document.getElementById("rules-disagree").addEventListener("click", () => dialog.close());
document.getElementById("rules-agree").addEventListener("click", () => {
    document.getElementById("name-error").textContent = "";
    dialog.switch("name-inputs");
});
document.getElementById("names-back").addEventListener("click", () => dialog.switch("rules"));
document.getElementById("names-confirm").addEventListener("click", () => {
    socket.emit("participate",
        document.getElementById("first-name").value,
        document.getElementById("last-name").value
    );
});

addEventListener("keydown", e => {
    if (e.key === "Enter") {
        if (dialog.current.id) e.preventDefault();

        if (dialog.current.id === "name-inputs")
            document.getElementById("names-confirm").click();
    } else if (e.key === "Escape" && dialog.current.id === "rules") {
        dialog.close();
    }
});

// Dictee form page
const initialDicteeSubmitH3 = document.getElementById("dictee-submit-h3").textContent;
const initialDicteeSubmitP = document.getElementById("dictee-submit-p").textContent;
const initialDicteeSubmitBtn = document.getElementById("dictee-submit-btn").textContent;
const roundsContainer = document.getElementById("dictee-rounds");

/**
 * One controller per round, each with `getAnswers()`, `filledCount()`, `total`, `isComplete()` and `showResults(keys, result)`.
 * @type {{card: HTMLElement, total: number, getAnswers: () => any[], filledCount: () => number, isComplete: () => boolean,
 *   showResults: (keys: any[], result: any) => void, refresh?: () => void}[]}
 */
let roundControllers = [];
let currentRound = 0;
/** Whether the dictee is being taken: the examiner decides which round is shown. Afterwards participants browse their results. */
let examMode = false;
const doneRounds = new Set();
let lastProgress = "";

const roundNav = document.getElementById("round-nav");
const roundPrev = document.getElementById("round-prev");
const roundNext = document.getElementById("round-next");
const roundDone = document.getElementById("round-done");
const submitCard = document.querySelector(".DicteeSubmit");
const isLastRound = () => currentRound === roundControllers.length - 1;

/**
 * Show only one round at a time, so a map is only on screen during a topo round.
 */
const showRound = (index) => {
    currentRound = Math.max(0, Math.min(index, roundControllers.length - 1));
    roundsContainer.style.display = "";
    roundControllers.forEach((c, i) => c.card.style.display = (i === currentRound) ? "" : "none");
    roundControllers[currentRound]?.refresh?.();

    document.getElementById("round-nav-title").textContent =
      `Ronde ${currentRound + 1} van ${roundControllers.length}`;
    roundNav.style.display = (examMode || roundControllers.length > 1) ? "" : "none";
    roundPrev.style.display = roundNext.style.display = examMode ? "none" : "";
    roundDone.style.display = examMode ? "" : "none";
    roundPrev.disabled = (currentRound === 0);
    roundNext.disabled = isLastRound();

    // handing in is only possible on the last round
    submitCard.style.display = (!examMode || isLastRound()) ? "" : "none";
    updateDoneButton();
};
const hideRounds = () => {
    roundsContainer.style.display = "none";
    roundNav.style.display = "none";
};
roundPrev.addEventListener("click", () => showRound(currentRound - 1));
roundNext.addEventListener("click", () => showRound(currentRound + 1));

const updateDoneButton = () => {
    const done = doneRounds.has(currentRound);
    roundDone.className = `small ${done ? "main-bg" : "green-bg"}`;
    roundDone.querySelector("span").textContent = done ? "Klaar! Toch aanpassen?" : "Klaar met deze ronde!";
    roundDone.querySelector("img").src = `/static/icons/${done ? "check-circle" : "arrow-right"}.svg`;
};
roundDone.addEventListener("click", () => {
    if (doneRounds.has(currentRound)) doneRounds.delete(currentRound);
    else doneRounds.add(currentRound);
    updateDoneButton();
    reportProgress();
});

/**
 * Keep the server up to date with the latest answers, so nothing is lost when the examiner ends the dictee.
 */
let syncTimeout = null;
const syncAnswers = () => {
    if (!examMode || syncTimeout) return;
    syncTimeout = setTimeout(() => {
        syncTimeout = null;
        if (examMode) socket.emit("round-answers", roundControllers.map(c => c.getAnswers()));
    }, 300);
};

/**
 * Let examiners see live how far a participant is with the current round.
 */
const reportProgress = () => {
    const controller = roundControllers[currentRound];
    if (!examMode || !controller) return;

    const filled = controller.filledCount();
    const done = doneRounds.has(currentRound);
    const key = `${currentRound}:${filled}:${done}`;
    if (key === lastProgress) return;

    lastProgress = key;
    socket.emit("round-progress", currentRound, filled, done);
};

document.getElementById("dictee-submit").addEventListener("click", () => {
    if (document.getElementById("dictee-submit").classList.contains("return-to-main")) {
        document.getElementById("dictee-submit").classList.remove("return-to-main");
        setParticipating(false);

        return;
    }

    if (!document.getElementById("dictee-submit").classList.contains("confirm-warning")) {
        document.getElementById("dictee-submit").classList.add("confirm-warning");
        document.getElementById("dictee-submit-h3").textContent = "Weet je het zeker?";
        document.getElementById("dictee-submit-p").textContent =
          (roundControllers.every(c => c.isComplete()) ? "" : "Je hebt nog niet alles ingevuld! ") +
          "Als je nog een keer klikt, kun je niet meer terug!";
        document.getElementById("dictee-submit-btn").textContent = "Ja, inleveren!";

        return;
    }

    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit").disabled = true;
    document.getElementById("dictee-submit-btn").textContent = "Wacht op de uitslag...";

    socket.emit("submit-answers", roundControllers.map(c => c.getAnswers()));
    examMode = false;
    hideRounds();

    document.getElementById("view-results").disabled = true;
});

const validateFormCompletion = (_e) => {
    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit-h3").textContent = initialDicteeSubmitH3;
    document.getElementById("dictee-submit-p").textContent = initialDicteeSubmitP;
    document.getElementById("dictee-submit-btn").textContent = initialDicteeSubmitBtn;
    document.getElementById("dictee-submit").disabled = false;
    reportProgress();
    syncAnswers();
};

const createRoundCard = (className, title) => {
    const card = document.createElement("div");
    card.className = `card ${className}`;

    const h3 = document.createElement("h3");
    h3.textContent = title;
    card.appendChild(h3);

    roundsContainer.appendChild(card);
    return card;
};

/**
 * Shared logic for rounds with text inputs: anti-cheat, completion and the "show correct answers" switch.
 */
const createInputsController = (card, inputs) => {
    const switcher = document.createElement("button");
    switcher.className = "main-bg answer-switcher";
    switcher.innerHTML = `<span>Laat juiste antwoorden zien</span>
      <img src="/static/icons/check-circle.svg" alt="Switch user/correct" class="img-r">`;
    card.appendChild(switcher);

    for (const i of inputs) {
        i.addEventListener("input", validateFormCompletion);
        i.addEventListener("keydown", e => {
            if (e.ctrlKey && e.key.toLowerCase() === "v") {
                socket.emit("anticheat-trigger", "clipboard-use");
                sonner.show("Oei, je hebt het klembord misbruikt, valsspeler!", "alert-circle", "red-bg");
            }
        });
    }

    let givenAnswers = [], rightAnswers = [], correct = [], showCorrectAnswers = false;
    const setCorrectAnswerVisibility = (to) => {
        showCorrectAnswers = (to === undefined) ? !showCorrectAnswers : to;

        switcher.querySelector("span").textContent = `Laat ${showCorrectAnswers ? "mijn" : "juiste"} antwoorden zien`;
        switcher.querySelector("img").src = `/static/icons/${showCorrectAnswers ? "user" : "check-circle"}.svg`;

        inputs.forEach((input, i) => {
            input.disabled = true;
            input.style.borderColor = (correct[i] || showCorrectAnswers) ? "lightgreen" : "salmon";
            input.value = showCorrectAnswers ? rightAnswers[i] : givenAnswers[i];
        });
    };
    switcher.addEventListener("click", () => setCorrectAnswerVisibility());

    return {
        card,
        total: inputs.length,
        getAnswers: () => inputs.map(i => i.value),
        filledCount: () => inputs.filter(i => i.value.trim().length > 0).length,
        isComplete: () => inputs.every(i => i.value.trim().length > 0),
        showResults(keys, result) {
            givenAnswers = inputs.map(i => i.value);
            rightAnswers = keys;
            correct = result.answers.map(a => a.correct);
            setCorrectAnswerVisibility(false);
            switcher.style.display = "flex";
        }
    };
};

/**
 * A text with blanks, read aloud by the examiner.
 */
const createDicteeRound = (round) => {
    const card = createRoundCard("DicteeForm", round.title);

    const contents = document.createElement("p");
    let html = htmlsp(round.text).replaceAll("\n", "<br>");
    while (html.includes("{}"))
        html = html.replace("{}", `<input spellcheck="false" autocomplete="off">`);
    contents.innerHTML = html;
    card.appendChild(contents);

    return createInputsController(card, [...contents.querySelectorAll("input")]);
};

/**
 * A list of sums to calculate.
 */
const createRekenenRound = (round) => {
    const card = createRoundCard("DicteeForm RekenenForm", round.title);

    const list = document.createElement("ol");
    list.className = "rekenen-sums";
    for (const sum of round.sums) {
        const li = document.createElement("li");
        li.innerHTML = `<span>${htmlsp(sum)} =</span><input inputmode="decimal" spellcheck="false" autocomplete="off">`;
        list.appendChild(li);
    }
    card.appendChild(list);

    return createInputsController(card, [...list.querySelectorAll("input")]);
};

/**
 * A map without labels on which the participant clicks the asked locations, one at a time.
 */
const createTopoRound = (round) => {
    const card = createRoundCard("TopoForm", round.title);
    const prompts = round.prompts;

    const promptBar = document.createElement("div");
    promptBar.className = "topo-prompt";
    promptBar.innerHTML = `<span class="topo-prompt-label">Klik op de kaart:</span>
      <strong class="topo-target"></strong><span class="topo-progress"></span>`;
    card.appendChild(promptBar);

    const chips = document.createElement("div");
    chips.className = "topo-chips";
    card.appendChild(chips);

    const mapElement = document.createElement("div");
    mapElement.className = "topo-map";
    card.appendChild(mapElement);

    const map = topo.createMap(mapElement, false, round.view);
    const answers = new Array(prompts.length).fill(null);
    const markers = new Array(prompts.length).fill(null);
    const resultLayer = L.layerGroup().addTo(map);
    let current = 0, keys = null, result = null, pendingFit = null;

    const chipButtons = prompts.map((_p, i) => {
        const chip = document.createElement("button");
        chip.className = "topo-chip small";
        chip.textContent = `${i + 1}`;
        chip.addEventListener("click", () => select(i, true));
        chips.appendChild(chip);
        return chip;
    });

    const render = () => {
        chipButtons.forEach((chip, i) => {
            chip.classList.toggle("selected", i === current);
            chip.classList.toggle("answered", !result && answers[i] !== null);
            chip.classList.toggle("scored", !!result);
            if (result) chip.style.setProperty("--chip-color", topo.scoreColor(result.answers[i].score));
        });

        const target = promptBar.querySelector(".topo-target");
        const progress = promptBar.querySelector(".topo-progress");
        target.textContent = prompts[current];

        if (result) {
            const a = result.answers[current];
            promptBar.querySelector(".topo-prompt-label").textContent = `${current + 1}.`;
            progress.className = `topo-progress ${topo.scoreClass(a.score)}`;
            progress.textContent = a.given === null ? "niet beantwoord — 0 punten" :
              a.distanceKm === 0 ? "goed! — 1 punt" :
              `${topo.formatKm(a.distanceKm)} ernaast — ${topo.formatPoints(a.score)} ${a.score === 1 ? "punt" : "punten"}`;
        } else {
            progress.className = "topo-progress";
            progress.textContent = `${answers.filter(a => a).length} / ${prompts.length} aangeklikt`;
        }

        markers.forEach((m, i) => {
            if (!m) return;
            m.setStyle({fillColor: i === current ? topo.colors.location : topo.colors.click});
            if (i === current) m.bringToFront();
        });
    };

    const select = (i, pan) => {
        current = i;
        render();

        if (result && keys) {
            map.flyToBounds(topo.resultBounds(keys[i], result.answers[i]), {padding: [80, 80], maxZoom: 7, duration: 0.6});
        } else if (pan && answers[i]) {
            map.panTo(answers[i]);
        }
    };

    map.on("click", e => {
        if (result) return;

        const latlng = {lat: e.latlng.lat, lng: topo.wrapLng(e.latlng.lng)};
        answers[current] = latlng;
        markers[current]?.remove();
        markers[current] = topo.clickMarker(e.latlng, topo.colors.location, current + 1).addTo(map);

        // go to the next location that has not been clicked yet
        const next = answers.findIndex((a, i) => a === null && i > current);
        const anyOpen = answers.findIndex(a => a === null);
        current = next > -1 ? next : anyOpen > -1 ? anyOpen : current;

        render();
        validateFormCompletion();
    });

    render();

    return {
        card,
        total: prompts.length,
        getAnswers: () => answers,
        filledCount: () => answers.filter(a => a !== null).length,
        isComplete: () => answers.every(a => a !== null),
        refresh() {
            // the map can be created or fitted while hidden, so size and zoom are applied once it is shown
            map.invalidateSize();
            if (pendingFit) {
                map.fitBounds(pendingFit, {padding: [60, 60], maxZoom: 7});
                pendingFit = null;
            }
        },
        showResults(answerKeys, roundResult) {
            keys = answerKeys;
            result = roundResult;
            markers.forEach(m => m?.remove());
            card.classList.add("finished");

            keys.forEach((key, i) => {
                const a = result.answers[i];
                const color = topo.scoreColor(a.score);
                topo.geometryLayer(key.geometry, topo.colors.correct)
                  .bindTooltip(`${i + 1}. ${htmlsp(key.name)}`, {sticky: true})
                  .on("click", () => select(i, true))
                  .addTo(resultLayer);

                if (a.given) {
                    if (a.nearest)
                        L.polyline([a.given, a.nearest], {color, weight: 2, dashArray: "6 6"}).addTo(resultLayer);
                    topo.clickMarker(a.given, color, i + 1).on("click", () => select(i, true)).addTo(resultLayer);
                }
            });

            const all = keys.reduce((b, key, i) => b.extend(topo.resultBounds(key, result.answers[i])), L.latLngBounds([]));
            if (all.isValid()) pendingFit = all;
            current = 0;
            render();
        }
    };
};

// Results
document.getElementById("view-results").addEventListener("click", () => {
    showRound(0);
    document.getElementById("dictee-form-header").textContent = "Je resultaat";
    document.getElementById("dictee-submit").disabled = false;
    document.getElementById("dictee-submit").classList.add("return-to-main");
    document.getElementById("dictee-submit-btn").textContent = "Terug naar homepage";
    document.getElementById("dictee-submit-h3").textContent = "Genoeg gezien?";
    document.getElementById("dictee-submit-p").textContent =
      "Klik hieronder om terug te gaan. Voor meer vragen kun je bij je examinator terecht.";

    dialog.close();
});

// Socket.IO events
socket.on("dictee-version", v => document.getElementById("version").textContent = `v${v}`);
socket.on("dictee-state", (state, waiting, max) => {
    const full = (waiting === max);
    document.getElementById("wait-available").style.color = (state === "open" && !full) ? "var(--grid-card)" : "";

    const buttonText = (state === "closed") ? "Niet beschikbaar" :
      (state === "open" && full) ? "Vol" :
      (state === "open") ? "Beschikbaar" :
      (state === "ended") ? "Afgelopen" : "Bezig";

    participateStatus.textContent = buttonText;
    participateUserCount.textContent = (state === "closed") ? "— / —" : `${waiting} / ${max}`;

    participateButton.disabled = (state !== "open" || full);
    participateStatus.className = (state === "closed") ? "red-fg" :
      (full || state === "busy" || state === "ended") ? "orange-fg" : "green-fg";
});

socket.on("participate-reply", (err, pid) => {
    if (err) {
        document.getElementById("name-error").textContent = err;
        return;
    }
    const participantID = isNaN(pid) ? "---" : `#${+pid + 1}`;

    document.body.requestFullscreen({navigationUI: "hide"}).then(() => {
        document.getElementById("waiting-room-welcome").textContent = document.getElementById("first-name").value;
        document.getElementById("participant-id").textContent = participantID;
        dialog.switch("waiting-room");
    }).catch(err => console.error(err.message));
});

socket.on("force-quit", (reason) => {
    const dialogInvolved = (dialog.current.element && !dialog.forcefulClose);

    if (dialogInvolved || isParticipating())
        sonner.show(reason, "alert-circle", "red-bg");

    if (dialogInvolved) dialog.close();
    if (isParticipating()) setParticipating(false);
});

socket.on("dictee-start", (rounds, startRound) => {
    [...roundsContainer.children].forEach(c => c.remove());
    const creators = {dictee: createDicteeRound, topo: createTopoRound, rekenen: createRekenenRound};
    roundControllers = rounds.map(r => creators[r.type](r));

    document.getElementById("dictee-submit").classList.remove("return-to-main");
    document.getElementById("dictee-form-header").textContent = "Succes!";
    examMode = true;
    doneRounds.clear();
    lastProgress = "";

    dialog.close(document.body);
    setParticipating(true);
    showRound(startRound ?? 0);
    validateFormCompletion();
});

socket.on("dictee-ended", () => {
    if (!examMode) return;

    examMode = false;
    hideRounds();
    submitCard.style.display = "";
    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit").disabled = true;
    document.getElementById("dictee-submit-h3").textContent = "Tijd is om!";
    document.getElementById("dictee-submit-p").textContent = "De examinator heeft het dictee beëindigd. Je antwoorden zijn ingeleverd.";
    document.getElementById("dictee-submit-btn").textContent = "Wacht op de uitslag...";
    document.getElementById("view-results").disabled = true;
    sonner.show("De examinator heeft het dictee beëindigd.", "alert-circle", "red-bg");
});

socket.on("dictee-round", index => {
    if (!examMode) return;

    showRound(index);
    validateFormCompletion();
    scrollTo({top: 0, behavior: "smooth"});
    sonner.show(`De examinator is naar ronde ${index + 1} gegaan.`, "arrow-right", "green-bg");
});

socket.on("results", (score, maxScore, grade, passed) => {
    document.getElementById("pass-fail").className = (passed) ? "green-fg" : "red-fg";
    document.getElementById("pass-fail").textContent = (passed) ? "Geslaagd!" : "Gezakt.";
    document.getElementById("pass-fail-subtitle").textContent = (passed) ? "Gefeliciteerd!" : "Volgende keer lukt het vast wel.";
    document.getElementById("result-description").innerHTML =
      `Je had <span>${topo.formatPoints(score)} van de ${maxScore}</span> punten en hebt daarmee een <span>${htmlsp(grade)}</span> gehaald.`;

    dialog.open("result", document.getElementById("dictee-submit"));
});

socket.on("answer-keys", (answerKeys, roundResults) => {
    roundControllers.forEach((c, i) => c.showResults(answerKeys[i], roundResults[i]));
    document.getElementById("view-results").disabled = false;
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    if (dialog.current.element || isParticipating())
        // do not load icon because server is probably offline now
        sonner.show("Oei, de server is ermee gekapt.", null, "red-bg");

    if (dialog.current.element) dialog.close();
    if (isParticipating()) setParticipating(false);

    participateStatus.textContent = "Offline";
    participateStatus.className = "red-fg";
    participateButton.disabled = true;
});

// anti-cheats
document.addEventListener("fullscreenchange", e => {
    if (!enforceAnticheats() || !socket.connected) return;

    if (!document.fullscreen) {
        socket.emit("anticheat-trigger", "fullscreen-exit");
        sonner.show("Oei, je bent uit fullscreen gegaan, valsspeler!", "alert-circle", "red-bg");
    }
});

document.addEventListener("visibilitychange", () => {
    if (!enforceAnticheats() || !socket.connected) return;

    if (document.hidden)
        socket.emit("anticheat-trigger", "tab-switch");
    else
        sonner.show("Oei, je bent op een ander browsertabblad geweest, valsspeler!", "alert-circle", "red-bg");
});
