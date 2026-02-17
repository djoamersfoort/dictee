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

const sonner = {
    element: document.querySelector(".sonner"),
    duration: 5000,
    /** @type {number[]} */
    timeouts: [],
    getClipPath: (x) => `inset(calc(100% - var(--expire-bar-height)) ${x}% 0 0)`,

    show(text, icon, bgClass) {
        for (const i of this.timeouts) clearTimeout(i);

        this.element.className = `sonner ${bgClass}`;

        this.element.querySelector("#sonner-text").textContent = text;
        if (icon) {
            this.element.querySelector("#sonner-icon").style.display = "";
            this.element.querySelector("#sonner-icon").src = `/static/icons/${icon}.svg`;
            this.element.querySelector("#sonner-icon").alt = icon;
        } else this.element.querySelector("#sonner-icon").style.display = "none";

        this.element.style.top = "calc(var(--spacing) * 2)";
        this.element.style.left = `calc(50vw - ${this.element.clientWidth / 2}px)`;
        this.element.style.setProperty("--expire-clip-path", this.getClipPath(0));

        this.element.style.setProperty("--expire-transition", "none");
        setTimeout(() => {
            this.element.style.setProperty("--expire-clip-path", this.getClipPath(0));
            setTimeout(() => {
                this.element.style.setProperty("--expire-transition", `${this.duration}ms linear`);
                setTimeout(() => {
                    this.element.style.setProperty("--expire-clip-path", this.getClipPath(100));
                }, 20);
            }, 20);
        }, 20);

        this.timeouts.push(setTimeout(() => {
            this.element.style.top = "";
        }, this.duration));
    }
};
