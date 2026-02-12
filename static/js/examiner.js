import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

const answers = [];

// Contents
const title = document.getElementById("dictee-title");
const contents = document.getElementById("dictee-contents");
const saveButton = document.getElementById("dictee-save");
const statusText = document.getElementById("dictee-contents-status");

saveButton.addEventListener("click", () => {
    socket.emit("examiner-dictee-update", `${title.value}\n${contents.value}`);
});

const validateContentsInput = (e) => {
    const openWords = e.target.value.match(/\{(.+?)\}/g);
    const openWordCount = (openWords) ? openWords.length : 0;
    const curlyBracesOpen = e.target.value.match(/\{/g) ? e.target.value.match(/\{/g).length : 0;
    const curlyBracesClose = e.target.value.match(/\}/g) ? e.target.value.match(/\}/g).length : 0;
    const curlyBracesNothingBetween = /\{\}/g.test(e.target.value);

    let valid = true;
    let output = `De kandidaten moeten in dit dictee ${openWordCount} ${(openWordCount === 1) ? "antwoord":"antwoorden"} geven`;

    if (curlyBracesOpen != curlyBracesClose || curlyBracesNothingBetween) {
        output += ", maar je syntax is niet helemaal lekker.";
        valid = false;
    } else if (openWordCount === 0) {
        output += ". Waar is het dictee nou gebleven?";
        valid = false;
    } else output += ".";

    statusText.textContent = output;
    saveButton.disabled = !valid;
};

contents.addEventListener("input", validateContentsInput);

socket.on("examiner-contents", (t, c) => {
    title.value = t;
    contents.textContent = c;

    const derivedAnswers = [];
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

const kickParticipant = (index) => socket.emit("examiner-kick", index);

socket.on("examiner-participants", participants => {
    [...participantList.children].forEach(c => c.remove());

    for (let i=0; i<participants.length; i++) {
        if (!participants[i]) continue;

        const statusText = document.createElement("a");
        if (participants[i].result && participants[i].result.answers.length > 0) {
            const correctCount = participants[i].result.answers.filter(a => a.correct).length;
            const passed = participants[i].result.passed ? "geslaagd" : "gezakt";

            statusText.textContent =
              `${correctCount}/${participants[i].result.answers.length} juist → ${participants[i].result.grade} ${passed}`;
        } else {
            statusText.textContent = "Nog niet klaar";
        }

        const label = document.createElement("b");
        label.innerHTML = `${participants[i].firstName} ${participants[i].lastName} <em>#${i + 1}</em><br>`;
        label.innerHTML += statusText.outerHTML;

        const kickButton = document.createElement("button");
        kickButton.classList.add("red-bg");
        kickButton.addEventListener("click", () => {
            kickButton.classList.contains("confirm-warning") ? kickParticipant(i) : kickButton.classList.add("confirm-warning");
        });

        const kickButtonIcon = document.createElement("img");
        kickButtonIcon.src = "/static/icons/user-x.svg";
        kickButtonIcon.alt = `Kick ${participants[i].firstName}`;
        kickButton.appendChild(kickButtonIcon);

        const wrapper = document.createElement("p");
        wrapper.appendChild(label);
        wrapper.appendChild(kickButton);

        participantList.appendChild(wrapper);
    }
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
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    sonner.show("De server is ermee gekapt!", null, "red-bg");
});
