import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

const participateButton = document.getElementById("participate");
const participateLabel = document.getElementById("participation-state");

const setParticipating = (to) => {
    document.querySelector(".Home").style.display = (to) ? "none" : "grid";
    document.querySelector(".Dictee").style.display = (to) ? "flex" : "none";

    shortDisableOverflow();
    onbeforeunload = (to) ? () => "Je kunt hier niet meer terugkomen als je refresht!" : null;
};
const isParticipating = () => document.querySelector(".Home").style.display === "none";

// Homepage
document.getElementById("rules-link").addEventListener("click", e => dialog.open("rules", e.target, false));
participateButton.addEventListener("click", () => dialog.open("rules", participateButton, true));

document.getElementById("rules-close").addEventListener("click", () => dialog.close());
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
    } else if (e.key === "Escape" && dialog.current.id === "rules") {
        dialog.close();
    }
});

// Dictee form page
const initialDicteeSubmitH3 = document.getElementById("dictee-submit-h3").textContent;
const initialDicteeSubmitP = document.getElementById("dictee-submit-p").textContent;
const initialDicteeSubmitBtn = document.getElementById("dictee-submit-btn").textContent;

document.getElementById("dictee-submit").addEventListener("click", () => {
    if (document.getElementById("dictee-submit").classList.contains("return-to-main")) {
        document.getElementById("dictee-submit").classList.remove("return-to-main");
        setParticipating(false);

        return;
    }

    if (!document.getElementById("dictee-submit").classList.contains("confirm-warning")) {
        document.getElementById("dictee-submit").classList.add("confirm-warning");
        document.getElementById("dictee-submit-h3").textContent = "Weet je het zeker?";
        document.getElementById("dictee-submit-p").textContent = "Als je nog een keer klikt, kun je niet meer terug!";
        document.getElementById("dictee-submit-btn").textContent = "Ja, inleveren!";

        return;
    }

    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit").disabled = true;
    document.getElementById("dictee-submit-btn").textContent = "Wacht op de uitslag...";

    const answers = [...document.querySelectorAll(".DicteeForm input")].map(i => i.value);
    socket.emit("submit-answers", answers);

    document.getElementById("view-results").disabled = true;
});

const validateFormCompletion = (_e) => {
    document.getElementById("dictee-submit").classList.remove("confirm-warning");
    document.getElementById("dictee-submit-h3").textContent = initialDicteeSubmitH3;
    document.getElementById("dictee-submit-p").textContent = initialDicteeSubmitP;
    document.getElementById("dictee-submit-btn").textContent = initialDicteeSubmitBtn;
    document.getElementById("dictee-submit").disabled = false;

    for (const i of document.querySelectorAll(".DicteeForm input")) {
        if (i.value.length === 0) {
            document.getElementById("dictee-submit").disabled = true;
            break;
        }
    }
};

// Results
const givenAnswers = [];
const rightAnswers = [];
let showCorrectAnswers = false;

const setCorrectAnswerVisibility = (_e, to) => {
    showCorrectAnswers = (to === undefined) ? !showCorrectAnswers : to;

    document.getElementById("answer-switcher-text").textContent =
      `Laat ${showCorrectAnswers ? "mijn" : "juiste"} antwoorden zien`;
    document.getElementById("answer-switcher-icon").src =
      `/static/icons/${showCorrectAnswers ? "user" : "check-circle"}.svg`;

    document.querySelectorAll(".DicteeForm input").forEach((input, i) => {
        const correctlyAnswered = (givenAnswers[i] === rightAnswers[i]);

        input.disabled = true;
        input.style.borderColor = (correctlyAnswered || showCorrectAnswers) ? "lightgreen" : "salmon";
        input.value = showCorrectAnswers ? rightAnswers[i] : givenAnswers[i];
    });
};

document.getElementById("answer-switcher").addEventListener("click", setCorrectAnswerVisibility);
document.getElementById("view-results").addEventListener("click", () => {
    setCorrectAnswerVisibility(null, false);
    document.getElementById("answer-switcher").style.display = "flex";

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

socket.on("participate-reply", (err, pid) => {
    if (err) {
        document.getElementById("name-error").textContent = err;
        return;
    }
    const participantID = isNaN(pid) ? "---" : +pid + 1;

    document.body.requestFullscreen({navigationUI: "hide"}).catch(err => console.error(err.message));
    document.getElementById("waiting-room-welcome").textContent = document.getElementById("first-name").value;
    document.getElementById("participant-id").textContent = `#${participantID}`;
    dialog.switch("waiting-room");
});

socket.on("force-quit", (reason) => {
    const dialogInvolved = (dialog.current.element && !dialog.forcefulClose);

    if (dialogInvolved || isParticipating())
        sonner.show(reason, "alert-circle", "red-bg");

    if (dialogInvolved) dialog.close();
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

    document.getElementById("dictee-form-header").textContent = "Succes!";
    document.getElementById("dictee-form-title").textContent = title;
    document.getElementById("dictee-form-contents").innerHTML = html;
    document.getElementById("answer-switcher").style.display = "";

    for (const i of document.querySelectorAll(".DicteeForm input"))
        i.addEventListener("input", validateFormCompletion);
    validateFormCompletion();

    dialog.close(document.body);
    setParticipating(true);
});

socket.on("results", (score, maxScore, grade, passed) => {
    document.getElementById("pass-fail").className = (passed) ? "green-fg" : "red-fg";
    document.getElementById("pass-fail").textContent = (passed) ? "Geslaagd!" : "Gezakt.";
    document.getElementById("pass-fail-subtitle").textContent = (passed) ? "Gefeliciteerd!" : "Volgende keer lukt het vast wel.";
    document.getElementById("result-description").innerHTML =
      `Je had <span>${score} van de ${maxScore}</span> antwoorden goed en hebt daarmee een <span>${grade}</span> gehaald.`;

    dialog.open("result", document.getElementById("dictee-submit"));
});

socket.on("answer-keys", answerKeys => {
    document.getElementById("view-results").disabled = false;

    givenAnswers.splice(0, givenAnswers.length, ...[...document.querySelectorAll(".DicteeForm input")].map(i => i.value));
    rightAnswers.splice(0, rightAnswers.length, ...answerKeys);
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
