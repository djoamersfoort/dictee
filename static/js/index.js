import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

const participateButton = document.getElementById("participate");
const participateLabel = document.getElementById("participation-state");

const setParticipating = (to) => {
    document.querySelector(".Home").style.display = (to) ? "none" : "grid";
    document.querySelector(".Dictee").style.display = (to) ? "flex" : "none";
    onbeforeunload = (to) ? () => "Je verlaat het dictee door te refreshen!" : null;
};
const isParticipating = () => document.querySelector(".Home").style.display === "none";

// Homepage
participateButton.addEventListener("click", () => dialog.open("rules", participateButton));
document.getElementById("rules-disagree").addEventListener("click", () => dialog.close());
document.getElementById("rules-agree").addEventListener("click", () => dialog.switch("name-inputs"));
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
    }
});

// Dictee form page
const initialDicteeSubmitH3 = document.getElementById("dictee-submit-h3").textContent;
const initialDicteeSubmitP = document.getElementById("dictee-submit-p").textContent;

document.getElementById("dictee-submit").addEventListener("click", () => {
    if (!document.getElementById("dictee-submit").classList.contains("confirm-warning")) {
        document.getElementById("dictee-submit").classList.add("confirm-warning");
        document.getElementById("dictee-submit-h3").textContent = "Weet je het zeker?";
        document.getElementById("dictee-submit-p").textContent = "Als je nog een keer klikt, kun je niet meer terug!";

        return;
    }

    const answers = [...document.querySelectorAll(".DicteeForm input")].map(i => i.value);
    socket.emit("submit-answers", answers);
});

const validateFormCompletion = (_e) => {
    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit-h3").textContent = initialDicteeSubmitH3;
    document.getElementById("dictee-submit-p").textContent = initialDicteeSubmitP;
    document.getElementById("dictee-submit").disabled = false;

    for (const i of document.querySelectorAll(".DicteeForm input")) {
        if (i.value.length === 0) {
            document.getElementById("dictee-submit").disabled = true;
            break;
        }
    }
};

// Socket.IO events
socket.on("dictee-state", (state, waiting, full) => {
    const waitingFormulation = (waiting === 1) ? `Er is ${waiting} kandidaat` : `Er zijn ${waiting} kandidaten`;
    const fullFormulation = (full) ? ", daarmee zit het vol." : ".";

    const buttonText = (state === "closed")
      ? `Op dit moment is er <span class="red-fg">geen</span> dictee beschikbaar.`
      : (state === "open")
      ? `Op dit moment is er een dictee <span class="green-fg">beschikbaar</span>.
         <br>${waitingFormulation} aan het wachten${fullFormulation}`
      : `Op dit moment is het dictee <span class="red-fg">bezig</span>.`;

    participateLabel.innerHTML = buttonText;
    participateButton.disabled = (state !== "open" || full);
});

socket.on("participate-reply", (err, id) => {
    if (err) {
        document.getElementById("name-error").textContent = err;
        return;
    }

    document.body.requestFullscreen({navigationUI: "hide"}).catch(err => console.error(err.message));
    document.getElementById("waiting-room-welcome").textContent = document.getElementById("first-name").value;
    dialog.switch("waiting-room");
});

socket.on("force-quit", (reason) => {
    if (dialog.current.element || isParticipating())
        sonner.show(reason, "alert-circle", "red-bg");

    if (dialog.current.element) dialog.close();
    if (isParticipating()) setParticipating(false);
});

socket.on("dictee-start", txt => {
    const contents = txt.split("\n");
    const title = contents.shift();
    let html = contents.join("\n").replaceAll("\n", "<br>");

    for (let i=0;; i++) {
        if (!html.includes("{}")) break;
        html = html.replace("{}", `<input id="dictee-answer-${i}" spellcheck="false" autocomplete="off">`);
    }

    document.getElementById("dictee-form-title").textContent = title;
    document.getElementById("dictee-form-contents").innerHTML = html;

    for (const i of document.querySelectorAll(".DicteeForm input"))
        i.addEventListener("input", validateFormCompletion);
    validateFormCompletion();

    dialog.close(document.body);
    setParticipating(true);
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    if (dialog.current.element || isParticipating())
        sonner.show("Oei, de server is ermee gekapt.", null, "red-bg");

    if (dialog.current.element) dialog.close();
    if (isParticipating()) setParticipating(false);

    participateLabel.innerHTML = `De server is <span class="red-fg">offline</span>.`
    participateButton.disabled = true;
});
