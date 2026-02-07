const dialog = {
    element: document.querySelector(".dialog"),
    overlay: document.getElementById("overlay"),
    /** @type {{id: string, element: HTMLElement | null}} */
    current: {id: "", element: null},
    flexDivs: ["result"],
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

        document.body.style.overflowY = "hidden";
        this.overlay.style.top = `${scrollY}px`;
        this.overlay.style.pointerEvents = "all";

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

            this.overlay.style.opacity = "1";

            this.current.id = id;
            this.current.element = startTarget;
            this.element.querySelector(`#${id}`).style.display = (this.flexDivs.includes(id) ? "flex" : "block");
            setTimeout(() => {
                this.element.querySelector(`#${id}`).style.opacity = "1";
            }, this.fadetime + 50);
        }, 50);
    },
    switch(id) {
        this.element.querySelector(`#${this.current.id}`).style.opacity = "0";
        setTimeout(() => {
            this.element.querySelector(`#${this.current.id}`).style.display = "none";
            this.element.querySelector(`#${id}`).style.display = (this.flexDivs.includes(id) ? "flex" : "block");
            setTimeout(() => {
                this.element.querySelector(`#${id}`).style.opacity = "1";
                this.current.id = id;
            }, this.fadetime);
        }, this.fadetime);
    },
    close(newElement) {
        if (newElement) this.current.element = newElement;

        this.element.querySelector(`#${this.current.id}`).style.opacity = "0";
        setTimeout(() => {
            const rect = this.current.element.getBoundingClientRect();

            this.element.querySelector(`#${this.current.id}`).style.display = "none";
            this.current.id = "";
            this.current.element = null;

            this.element.style.opacity = "0";
            this.element.style.width = `${rect.width}px`;
            this.element.style.height = `${rect.height}px`;
            this.element.style.left = `${rect.left}px`;
            this.element.style.top = `${rect.top}px`;

            this.overlay.style.opacity = "0";

            setTimeout(() => {
                this.element.style.transition =
                this.element.style.width = this.element.style.height
                this.element.style.left = this.element.style.top = "";

                document.body.style.overflowY = "";
                this.overlay.style.pointerEvents = "";
            }, this.fadetime);
        }, this.fadetime);
    }
};
