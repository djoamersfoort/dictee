import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

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
    let output = `De kandidaten moeten in dit dictee ${openWordCount} ${(openWordCount === 1) ? "antwoord":"antwoorden"} geven`;

    if (curlyBracesOpen != curlyBracesClose)
        output += ", maar je syntax is niet helemaal lekker.";
    else if (openWordCount === 0)
        output += ". Waar is het dictee nou gebleven?";
    else
        output += ".";

    statusText.textContent = output;
    saveButton.disabled = (openWordCount === 0 || curlyBracesOpen != curlyBracesClose);
};

contents.addEventListener("input", validateContentsInput);

socket.on("examiner-contents", (t, c) => {
    title.value = t;
    contents.textContent = c;
});

// Participants
const participantList = document.getElementById("participant-list");

const kickParticipant = (index) => socket.emit("examiner-kick", index);

socket.on("examiner-participants", participants => {
    [...participantList.children].forEach(c => c.remove());

    for (let i=0; i<participants.length; i++) {
        if (!participants[i]) continue;

        const label = document.createElement("b");
        label.textContent = `${participants[i].firstName} ${participants[i].lastName}`;

        const kickButton = document.createElement("button");
        kickButton.classList.add("red-bg");
        kickButton.addEventListener("click", () => {
            kickButton.classList.contains("kick-confirm") ? kickParticipant(i) : kickButton.classList.add("kick-confirm");
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

toClosed.addEventListener("click", () => socket.emit("examiner-set-state", "closed"));
toOpen.addEventListener("click", () => socket.emit("examiner-set-state", "open"));
toBusy.addEventListener("click", () => socket.emit("examiner-set-state", "busy"));

socket.on("examiner-state", state => {
    if (state === "closed") {
        title.disabled = contents.disabled = false;
        validateContentsInput({target: contents});
        stateLabel.textContent = "Gesloten";
        stateLabel.className = "red-fg";

        toClosed.style.display = toBusy.style.display = "none";
        toOpen.style.display = "flex";
    } else if (state === "open") {
        title.disabled = contents.disabled = saveButton.disabled = true;
        statusText.textContent = "Sluit het dictee af om het te kunnen bewerken.";
        stateLabel.textContent = "Open voor deelname";
        stateLabel.className = "green-fg";

        toOpen.style.display = "none";
        toClosed.style.display = toBusy.style.display = "flex";
    } else if (state === "busy") {
        title.disabled = contents.disabled = saveButton.disabled = true;
        statusText.textContent = "Sluit het dictee af om het te kunnen bewerken.";
        stateLabel.textContent = "Bezig";
        stateLabel.className = "green-fg";

        toOpen.style.display = toBusy.style.display = "none";
        toClosed.style.display = "flex";
    }
});
