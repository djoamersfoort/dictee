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

const answers = [];

// Display version
socket.on("dictee-version", v => document.getElementById("version").textContent = `v${v}`);

// Contents
const title = document.getElementById("dictee-title");
const contents = document.getElementById("dictee-contents");
const saveButton = document.getElementById("dictee-save");
const statusText = document.getElementById("dictee-contents-status");

const dicteeUpdate = () => socket.emit("examiner-dictee-update", `${title.value}\n${contents.value}`);

saveButton.addEventListener("click", dicteeUpdate);

const validateContentsInput = (_e) => {
    const openWords = contents.value.match(/\{(\S+)\}/g);
    const openWordCount = (openWords) ? openWords.length : 0;
    const curlyBracesOpen = contents.value.match(/\{/g) ? contents.value.match(/\{/g).length : 0;
    const curlyBracesClose = contents.value.match(/\}/g) ? contents.value.match(/\}/g).length : 0;
    const curlyBracesNothingBetween = /\{\s*\}/g.test(contents.value);

    let valid = true;
    let output = `De kandidaten moeten in dit dictee ${openWordCount} ${(openWordCount === 1) ? "antwoord":"antwoorden"} geven`;

    if (title.value.length === 0) {
        output += ", maar er mist een titel.";
        valid = false;
    } else if (curlyBracesOpen != curlyBracesClose || curlyBracesNothingBetween) {
        output += ", maar je syntax is niet helemaal lekker.";
        valid = false;
    } else if (openWordCount === 0) {
        output += ". Waar is het dictee nou gebleven?";
        valid = false;
    } else output += ".";

    statusText.textContent = output;
    saveButton.disabled = !valid;
};

title.addEventListener("input", validateContentsInput);
contents.addEventListener("input", validateContentsInput);

socket.on("examiner-contents", (t, c) => {
    title.value = t;
    contents.textContent = c;

    const derivedAnswers = [];
    if (c.match(/\{(.+?)\}/g))
        c.match(/\{(.+?)\}/g).forEach(a => derivedAnswers.push(a.replace(/\{|\}/g, "")));

    answers.splice(0, answers.length, ...derivedAnswers);
});

socket.on("examiner-dictee-update-reply", (err) => {
    if (err)
        sonner.show(`Oei, er ging iets mis: ${err.message}`, "alert-circle", "red-bg");
    else
        sonner.show("Het dictee is succesvol opgeslagen!", "check-circle", "green-bg");
});

// Participants
const participantList = document.getElementById("participant-list");
const noParticipants = document.getElementById("no-participants");

const kickParticipant = (index) => socket.emit("examiner-kick", index);

const viewResult = (e, participant) => {
    document.getElementById("comparison-name").textContent =
      `${participant.firstName} ${participant.lastName}`;

    const givenAnswers = participant.result.answers.map(a => a.given);
    const text = htmlsp(contents.textContent).replaceAll(/\{(.*?)\}/g, "{}").replaceAll("\n", "<br>");
    let textGiven = text, textCorrect = text;

    for (let i=0;; i++) {
        const className = (participant.result.answers[i].correct && givenAnswers[i] === answers[i]) ? "green-fg" :
          (participant.result.answers[i].correct || givenAnswers[i] === answers[i]) ? "orange-fg" : "red-fg";

        textGiven = textGiven.replace("{}", `<span class="${className}">${htmlsp(givenAnswers[i])}</span>`);
        textCorrect = textCorrect.replace("{}", `<span class="green-fg">${htmlsp(answers[i])}</span>`);
        if (!textGiven.includes("{}") || !textCorrect.includes("{}")) break;
    }

    document.getElementById("dictee-given").innerHTML = textGiven;
    document.getElementById("dictee-correct").innerHTML = textCorrect;

    dialog.open("inspector", e.target);
};
document.getElementById("inspector-close").addEventListener("click", () => dialog.close());

socket.on("examiner-participants", (participants, left) => {
    [...participantList.children].forEach(c => c.remove());

    for (let i=0; i<participants.length; i++) {
        if (!participants[i]) continue;

        const statusText = document.createElement("span");
        if (participants[i].result) {
            const correctCount = participants[i].result.answers.filter(a => a.correct).length;

            statusText.className = (participants[i].result.passed) ? "green-fg" : "red-fg";
            statusText.innerHTML =
              `${correctCount}/${participants[i].result.answers.length} = <strong>${participants[i].result.grade}</strong>`;
        } else {
            statusText.textContent = "Nog niet klaar";
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
            const correctCount = left[i].result.answers.filter(a => a.correct).length;

            statusText.className = (left[i].result.passed) ? "green-fg" : "red-fg";
            statusText.innerHTML =
              `${correctCount}/${left[i].result.answers.length} = <strong>${left[i].result.grade}</strong>`;

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
});

// Status
const stateLabel = document.getElementById("dictee-state");
const toClosed = document.getElementById("state-to-closed");
const toOpen = document.getElementById("state-to-open");
const toBusy = document.getElementById("state-to-busy");

const lichtkrantAPIon = document.getElementById("lichtkrant-api-on");
const lichtkrantAPIoff = document.getElementById("lichtkrant-api-off");

toClosed.addEventListener("click", () => socket.emit("examiner-set-state", "closed"));
toOpen.addEventListener("click", () => socket.emit("examiner-set-state", "open"));
toBusy.addEventListener("click", () => socket.emit("examiner-set-state", "busy"));

lichtkrantAPIon.addEventListener("click", () => socket.emit("examiner-set-lichtkrant-api", false));
lichtkrantAPIoff.addEventListener("click", () => socket.emit("examiner-set-lichtkrant-api", true));

socket.on("examiner-dashboard", (state, participantsIn, lichtkrantAPI) => {
    if (state === "closed") {
        title.disabled = contents.disabled = false;
        validateContentsInput({target: contents});
        stateLabel.textContent = "Gesloten";
        stateLabel.className = "red-fg";

        toClosed.style.display = toBusy.style.display = "none";
        toOpen.style.display = "flex";

        if (dialog.current.id) {
            sonner.show("Het dictee is zojuist afgesloten.", "alert-circle", "red-bg");
            dialog.close(document.body);
        }
    } else if (state === "open" && participantsIn) {
        title.disabled = contents.disabled = saveButton.disabled = true;
        statusText.textContent = "Sluit het dictee af om het te kunnen bewerken.";
        stateLabel.textContent = "Klaar voor start";
        stateLabel.className = "green-fg";

        toOpen.style.display = toClosed.style.display = "none";
        toBusy.style.display = "flex";
    } else if (state === "open") {
        title.disabled = contents.disabled = saveButton.disabled = true;
        statusText.textContent = "Sluit het dictee af om het te kunnen bewerken.";
        stateLabel.textContent = "Geopend";
        stateLabel.className = "green-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = "flex";
    } else if (state === "busy") {
        title.disabled = contents.disabled = saveButton.disabled = true;
        statusText.textContent = "Sluit het dictee af om het te kunnen bewerken.";
        stateLabel.textContent = "Aan het afnemen";
        stateLabel.className = "green-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = "flex";
    }

    lichtkrantAPIon.style.display = lichtkrantAPI ? "flex" : "";
    lichtkrantAPIoff.style.display = lichtkrantAPI ? "" : "flex";
    lichtkrantAPIoff.disabled = (state !== "busy");
});

// event handlers
const resizeNecessaryElements = () => {
    participantList.style.maxHeight =
      `${participantList.parentElement.clientHeight - 90}px`;

    noParticipants.style.marginTop =
      `${(noParticipants.parentElement.clientHeight - noParticipants.clientHeight - 125) / 2}px`;
};

addEventListener("load", resizeNecessaryElements);
addEventListener("resize", resizeNecessaryElements);

addEventListener("keydown", e => {
    if (e.key === "Escape" && dialog.current.id) dialog.close();
    else if (e.ctrlKey && e.key === "s" && !saveButton.disabled) {
        e.preventDefault();
        dicteeUpdate();
    }
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    if (dialog.current.id) dialog.close();

    sonner.show(
        "De server is ermee gekapt!",
        "alert-circle",
        "red-bg"
    );
});

socket.on("participant-cheat", (firstName, lastName, pid, method, meta) => {
    if (method !== "tab-back") sonner.show(`${firstName} ${lastName} (#${pid + 1}) cheated.`, "alert-circle", "red-bg");
    console.log(method, meta);
    for (const child of participantList.children) {
        if (child.querySelector("em").innerText.includes((pid + 1).toString())) {
            child.classList.add("red-fg");
            let cheatDetails = child.querySelector(".cheat-details");
            if (!cheatDetails) {
                cheatDetails = document.createElement("details");
                cheatDetails.classList.add("cheat-details");
                const summary = document.createElement("summary");
                summary.innerText = "Valsspeel details";
                cheatDetails.appendChild(summary);
                const properties = child.querySelector("b");
                properties.appendChild(document.createElement("br"));
                properties.appendChild(cheatDetails);
            }
            const cheatStatusWrapper = document.createElement("div");
            const cheatStatus = document.createElement("span");
            cheatStatus.innerText =
                method === "fullscreen"?
                    "Heeft fullscreen verlaten." :
                    method === "tab"?
                        "Is naar een ander browsertabblad gegaan" :
                        method === "tab-back"?
                            `Is teruggegaan na ${meta} seconden.` : `Valsgespeeld met onbekende methode: "${method}".`;
            cheatStatusWrapper.appendChild(cheatStatus);
            cheatDetails.appendChild(cheatStatusWrapper);
        }
    }
});