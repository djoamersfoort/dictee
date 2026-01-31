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

socket.on("dictee-state", (open, waiting) => {
    const buttonText = (open)
      ? `Op dit moment is er een dictee <span class="green-fg">beschikbaar</span>.<br>Er zijn ${waiting} mensen aan het wachten.`
      : `Op dit moment is er <span class="red-fg">geen</span> dictee beschikbaar.`;

    participateLabel.innerHTML = buttonText;
    participateButton.disabled = !open;
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
