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

// Shared Leaflet helpers for topo rounds. Requires Leaflet (global `L`).
const topo = {
    colors: {correct: "#1ec878", partial: "#f0a030", wrong: "#ff4646", click: "#ffffff", location: "#0082e6"},
    bordersURL: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
    /** @type {Promise<any> | null} */
    borders: null,

    /**
     * @param {HTMLElement} element
     * @param {boolean} labels Whether place names are drawn on the map. Never enable this for participants!
     * @param {[[number, number], [number, number]]} [view] Bounds to start with.
     */
    createMap(element, labels, view) {
        const map = L.map(element, {
            center: [50, 10], zoom: 4, minZoom: 2, maxZoom: labels ? 18 : 9,
            worldCopyJump: true, zoomSnap: 0.5, preferCanvas: true
        });

        if (labels) {
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19
            }).addTo(map);
        } else {
            // label-free relief map, with country borders drawn by ourselves (also without names)
            L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}", {
                attribution: 'Tiles &copy; Esri, US National Park Service | Grenzen: Natural Earth', maxNativeZoom: 8, maxZoom: 9
            }).addTo(map);

            this.borders ??= fetch(this.bordersURL).then(r => r.json())
              .then(world => topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
              .catch(() => null);
            this.borders.then(mesh => {
                if (mesh) L.geoJSON(mesh, {interactive: false, style: {color: "#4a3b2f", weight: 1, opacity: 0.7}}).addTo(map);
            });
        }
        if (view) map.fitBounds(view);
        return map;
    },

    geometryLayer(geometry, color) {
        return L.geoJSON(geometry, {
            style: {color, weight: 2, fillColor: color, fillOpacity: 0.25},
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, {radius: 8, color, weight: 2, fillOpacity: 0.4})
        });
    },

    /**
     * Bounds around a click and its location. Uses the location center instead of the full outline,
     * because outlines can include far away territories (e.g. France).
     */
    resultBounds(key, answer) {
        const bounds = L.latLngBounds([[key.lat, key.lng], [key.lat, key.lng]]);
        if (answer?.given) bounds.extend(answer.given);
        if (answer?.nearest) bounds.extend(answer.nearest);
        return bounds;
    },

    clickMarker(latlng, color, label) {
        const marker = L.circleMarker(latlng, {radius: 7, color: "#000", weight: 2, fillColor: color, fillOpacity: 1});
        if (label !== undefined)
            marker.bindTooltip(String(label), {permanent: true, direction: "top", offset: [0, -6], className: "topo-label"});
        return marker;
    },

    scoreColor(score) {
        return score >= 1 ? this.colors.correct : score > 0 ? this.colors.partial : this.colors.wrong;
    },
    scoreClass(score) {
        return score >= 1 ? "green-fg" : score > 0 ? "orange-fg" : "red-fg";
    },

    wrapLng: lng => ((((lng + 180) % 360) + 360) % 360) - 180,
    formatPoints: n => String(Math.round(n * 100) / 100),
    formatKm: km => km >= 100 ? `${Math.round(km)} km` : `${Math.round(km * 10) / 10} km`
};
