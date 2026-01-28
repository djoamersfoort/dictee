const participateButton = document.getElementById("participate");
const participateLabel = document.getElementById("participation-state");

participateButton.addEventListener("click", () => dialog.open("rules", participateButton));
document.getElementById("rules-disagree").addEventListener("click", () => dialog.close());
document.getElementById("rules-agree").addEventListener("click", () => dialog.switch("name-inputs"));
document.getElementById("names-back").addEventListener("click", () => dialog.switch("rules"));
document.getElementById("names-confirm").addEventListener("click", () => {
    const body = JSON.stringify({
        firstName: document.getElementById("first-name").value,
        lastName: document.getElementById("last-name").value,
    });

    fetch("/api/v1/participate", {method: "POST", body}).then(() => {

    }).catch(err => {

    });
});

ws.addEventListener("message", (e) => {
    const response = JSON.parse(e.data);

    if (response.act === "state") {
        const buttonText = (response.open)
          ? `Op dit moment is er een dictee <span class="green-fg">beschikbaar</span>.<br>Er zijn ${response.waiting} mensen aan het wachten.`
          : `Op dit moment is er <span class="red-fg">geen</span> dictee beschikbaar.`;

        participateLabel.innerHTML = buttonText;
        participateButton.disabled = !response.open;
    }
});
