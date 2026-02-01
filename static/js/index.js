import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

const participateButton = document.getElementById("participate");
const participateLabel = document.getElementById("participation-state");

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
    if (dialog.current.element) {
        dialog.close();
        sonner.show(reason, "alert-circle", "red-bg");
    }
});

socket.on("dictee-start", contents => {
    dialog.close();
    // todo: display dictee
});

// socket disconnect action, no self-made event
socket.on("disconnect", () => {
    if (dialog.current.element) {
        dialog.close();
        sonner.show("Oei, de server is ermee gekapt.", null, "red-bg");
    }

    participateLabel.innerHTML = `De server is <span class="red-fg">offline</span>.`
    participateButton.disabled = true;
});
