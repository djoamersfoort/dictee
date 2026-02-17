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

const dialog = {
    element: document.querySelector(".dialog"),
    overlay: document.getElementById("overlay"),
    /** @type {{id: string, element: HTMLElement | null}} */
    current: {id: "", element: null},
    flexDivs: ["result"],
    fadetime: 600,
    forcefulClose: true,
    /**
     * @param {string} id
     * @param {HTMLElement} startTarget
     * @param {any} justViewing
     */
    open(id, startTarget, justViewing) {
        if (id === "rules") {
            this.forcefulClose = !justViewing;
            this.element.querySelector("#rules-close").style.display = (justViewing) ? "none" : "";

            this.element.querySelector("#rules-disagree").style.display =
            this.element.querySelector("#rules-agree").style.display = (justViewing) ? "" : "none";
        }

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
