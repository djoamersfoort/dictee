const participateButton = document.getElementById("participate");
const participateLabel = document.getElementById("participation-state");
const overlay = document.getElementById("overlay");

const dialog = {
    element: document.querySelector(".dialog"),
    /** @type {{id: string, rect: DOMRect | null}} */
    current: {id: "", rect: null},
    fadetime: 600,
    /**
     * @param {string} id
     * @param {HTMLElement} startTarget
     */
    open(id, startTarget) {
        if (this.current.id) {
            this.switch(id);
            return;
        }

        document.body.style.setProperty("--dialog-transition-time", `${this.fadetime}ms`);
        const rect = startTarget.getBoundingClientRect();

        this.element.style.transition = "";
        this.element.style.width = `${rect.width}px`;
        this.element.style.height = `${rect.height}px`;
        this.element.style.left = `${rect.left}px`;
        this.element.style.top = `${rect.top}px`;

        setTimeout(() => {
            this.element.style.transition = "0.75s ease";
            this.element.style.opacity = "1";
            this.element.style.width = "calc(100vw - var(--dialog-spacing) * 2)"
            this.element.style.height = "calc(100vh - var(--dialog-spacing) * 2)";
            this.element.style.left = this.element.style.top = "var(--dialog-spacing)";

            overlay.style.opacity = "1";

            this.current.id = id;
            this.current.rect = rect;
            this.element.querySelector(`#${id}`).style.display = "block";
            setTimeout(() => {
                this.element.querySelector(`#${id}`).style.opacity = "1";
            }, this.fadetime + 50);
        }, 50);
    },
    switch(id) {
        this.element.querySelector(`#${this.current.id}`).style.opacity = "0";
        setTimeout(() => {
            this.element.querySelector(`#${this.current.id}`).style.display = "none";
            this.element.querySelector(`#${id}`).style.display = "block";
            setTimeout(() => {
                this.element.querySelector(`#${id}`).style.opacity = "1";
                this.current.id = id;
            }, this.fadetime);
        }, this.fadetime);
    },
    close() {
        this.element.querySelector(`#${this.current.id}`).style.opacity = "0";
        setTimeout(() => {
            this.element.querySelector(`#${this.current.id}`).style.display = "none";
            this.current.id = "";

            this.element.style.opacity = "0";
            this.element.style.width = `${this.current.rect.width}px`;
            this.element.style.height = `${this.current.rect.height}px`;
            this.element.style.left = `${this.current.rect.left}px`;
            this.element.style.top = `${this.current.rect.top}px`;

            overlay.style.opacity = "0";

            setTimeout(() => {
                this.element.style.transition =
                this.element.style.width = this.element.style.height
                this.element.style.left = this.element.style.top = "";
            }, this.fadetime);
        }, this.fadetime);
    }
};

participateButton.addEventListener("click", () => dialog.open("rules", participateButton));
document.getElementById("rules-disagree").addEventListener("click", () => dialog.close());
document.getElementById("rules-agree").addEventListener("click", () => dialog.switch("name-inputs"));
document.getElementById("names-back").addEventListener("click", () => dialog.switch("rules"));
document.getElementById("names-confirm").addEventListener("click", () => {
    if (ws.readyState == 1) ws.send(JSON.stringify({
        act: "join",
        firstName: document.getElementById("first-name").value,
        lastName: document.getElementById("last-name").value,
    }));
});


const ws = new WebSocket(`ws://${location.hostname}:7001`);
ws.addEventListener("message", (e) => {
    const response = JSON.parse(e.data);

    if (response.act == "state") {
        const buttonText = (response.open)
          ? `Op dit moment is er een dictee <span class="green-fg">beschikbaar</span>.<br>Er zijn ${response.waiting} mensen aan het wachten.`
          : `Op dit moment is er <span class="red-fg">geen</span> dictee beschikbaar.`;

        participateLabel.innerHTML = buttonText;
        participateButton.disabled = !response.open;
    }
});
