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

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { version } from "../package.json" with {type: "json"};
import { evaluateSum, sumLines, formatNumber } from "../static/js/calc.js";


export type LatLng = {lat: number, lng: number};
export type Geometry = {type: string, coordinates?: any, geometries?: Geometry[]};

export type TopoLocation = {
    id: string,
    name: string, // shown to participants
    description: string, // full name from OpenStreetMap, only shown to examiners
    lat: number,
    lng: number,
    geometry: Geometry
};

export type DicteeRound = {id: string, type: "dictee", title: string, active: boolean, text: string};
export type TopoRound = {
    id: string, type: "topo", title: string, active: boolean,
    maxDistanceKm: number, // clicks further away than this from the location get 0 points
    locations: TopoLocation[]
};
/** Mental arithmetic: one sum per line in `text`, the answers are calculated automatically. */
export type RekenenRound = {id: string, type: "rekenen", title: string, active: boolean, text: string};
export type Round = DicteeRound | TopoRound | RekenenRound;
export type RoundType = Round["type"];

/** The part of a round participants are allowed to see before submitting. */
export type ParticipantRound =
    {type: "dictee", title: string, text: string} |
    {type: "topo", title: string, prompts: string[], view: [[number, number], [number, number]]} |
    {type: "rekenen", title: string, sums: string[]};

export type DicteeRoundResult = {type: "dictee" | "rekenen", roundID: string, answers: {given: string, correct: boolean}[]};
export type TopoRoundResult = {
    type: "topo", roundID: string,
    answers: {given: LatLng | null, distanceKm: number | null, score: number, nearest: LatLng | null}[]
};
export type RoundResult = DicteeRoundResult | TopoRoundResult;

export const roundsFile = join(import.meta.dirname, "..", "data", "rounds.json");
const legacyContentsFile = join(import.meta.dirname, "..", "data", "contents.txt");

const formInput = /\{(.*?)\}/g;
/**
 * Clicks on a location without an outline (e.g. a mountain top, or a city stored as a point) get full points
 * within this radius, which grows with the max distance of the round: 1/20 of it, at least 3 km.
 */
const pointRadiusKm = (maxDistanceKm: number) => Math.max(3, maxDistanceKm / 20);
const defaultMaxDistanceKm = 250;

export const newID = () => crypto.randomUUID().slice(0, 8);


/* ---------- storage ---------- */

/**
 * Load all rounds. Migrates the pre-rounds `contents.txt` into a single dictee round when needed.
 */
export const loadRounds = (): Round[] => {
    if (!existsSync(roundsFile)) {
        let rounds: Round[] = [];

        if (existsSync(legacyContentsFile)) {
            const lines = readFileSync(legacyContentsFile, "utf-8").split("\n");
            const title = lines.shift()?.trim() || "Dictee";
            rounds = [{id: newID(), type: "dictee", title, active: true, text: lines.join("\n").trimEnd()}];
        } else {
            rounds = [{id: newID(), type: "dictee", title: "Een titel", active: true, text: "Een {episch} dictee!"}];
        }

        writeFileSync(roundsFile, JSON.stringify(rounds, null, 4));
        return rounds;
    }

    try {
        return sanitizeRounds(JSON.parse(readFileSync(roundsFile, "utf-8")));
    } catch {
        return [];
    }
};

export const saveRounds = (rounds: Round[], callback: (err: Error | null) => void) => {
    Bun.write(roundsFile, JSON.stringify(rounds, null, 4))
        .then(() => callback(null))
        .catch(err => callback(err));
};


/* ---------- validation ---------- */

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const geometryTypes = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"];

const sanitizeGeometry = (g: any): Geometry | null => {
    if (!g || typeof g !== "object" || !geometryTypes.includes(g.type)) return null;
    if (g.type === "GeometryCollection") {
        if (!Array.isArray(g.geometries)) return null;
        const geometries = g.geometries.map(sanitizeGeometry).filter((x: Geometry | null) => x);
        return geometries.length ? {type: g.type, geometries} : null;
    }
    return Array.isArray(g.coordinates) ? {type: g.type, coordinates: g.coordinates} : null;
};

/**
 * Coerce untrusted input into a list of valid rounds; invalid entries are dropped.
 */
export const sanitizeRounds = (input: unknown): Round[] => {
    if (!Array.isArray(input)) return [];
    const rounds: Round[] = [];

    for (const r of input) {
        if (!r || typeof r !== "object") continue;
        const id = typeof r.id === "string" && r.id ? r.id.slice(0, 32) : newID();
        const title = String(r.title ?? "").replaceAll("\n", " ").trim();
        const active = r.active !== false;

        if (r.type === "dictee" || r.type === "rekenen") {
            rounds.push({id, type: r.type, title, active, text: String(r.text ?? "").trimEnd()});
        } else if (r.type === "topo") {
            const locations: TopoLocation[] = [];
            for (const l of Array.isArray(r.locations) ? r.locations : []) {
                const geometry = sanitizeGeometry(l?.geometry);
                if (!geometry || !isFiniteNumber(l.lat) || !isFiniteNumber(l.lng)) continue;
                locations.push({
                    id: typeof l.id === "string" && l.id ? l.id.slice(0, 32) : newID(),
                    name: String(l.name ?? "").replaceAll("\n", " ").trim(),
                    description: String(l.description ?? ""),
                    lat: l.lat, lng: l.lng, geometry
                });
            }
            const maxDistanceKm = isFiniteNumber(r.maxDistanceKm) && r.maxDistanceKm > 0 ?
                Math.min(r.maxDistanceKm, 20000) : defaultMaxDistanceKm;

            rounds.push({id, type: "topo", title, active, maxDistanceKm, locations});
        }
    }
    return rounds;
};

/**
 * Get the answer keys of a dictee round text.
 */
export const dicteeAnswerKeys = (text: string) =>
    (text.match(formInput) ?? []).map(a => a.slice(1, -1));

/**
 * @returns a (Dutch) problem description, or `null` when the round is fine.
 */
export const validateRound = (round: Round): string | null => {
    if (!round.title) return "er mist een titel";

    if (round.type === "dictee") {
        const open = (round.text.match(/\{/g) ?? []).length;
        const close = (round.text.match(/\}/g) ?? []).length;
        if (open !== close || /\{\s*\}/.test(round.text)) return "je syntax is niet helemaal lekker";
        if (dicteeAnswerKeys(round.text).length === 0) return "er zijn geen in te vullen woorden";
    } else if (round.type === "rekenen") {
        const lines = sumLines(round.text);
        if (lines.length === 0) return "er zijn geen sommen";
        for (const line of lines) {
            try {
                evaluateSum(line);
            } catch (err) {
                return `de som "${line}" klopt niet: ${(err as Error).message}`;
            }
        }
    } else {
        if (round.locations.length === 0) return "er zijn geen locaties";
        if (round.locations.some(l => !l.name)) return "niet alle locaties hebben een naam";
    }
    return null;
};

/** The sums of a rekenen round, written down neatly, with their outcomes. */
export const rekenenSums = (text: string) => sumLines(text).map(line => evaluateSum(line));

/** The amount of points a participant can get in a round. */
export const roundMaxPoints = (round: Round) =>
    round.type === "dictee" ? dicteeAnswerKeys(round.text).length :
    round.type === "rekenen" ? sumLines(round.text).length :
    round.locations.length;

/** Strip everything participants should not see (answers, geometry). */
export const toParticipantRound = (round: Round): ParticipantRound =>
    round.type === "dictee" ? {type: "dictee", title: round.title, text: round.text.replaceAll(formInput, "{}")} :
    round.type === "rekenen" ? {type: "rekenen", title: round.title, sums: rekenenSums(round.text).map(s => s.display)} :
    {type: "topo", title: round.title, prompts: round.locations.map(l => l.name), view: topoView(round)};

/**
 * The area participants start with: around all locations, padded with the max distance so it does not point at one.
 */
const topoView = (round: TopoRound): [[number, number], [number, number]] => {
    const pad = Math.max(round.maxDistanceKm, 100) / kmPerDegree;
    const lats = round.locations.map(l => l.lat), lngs = round.locations.map(l => l.lng);
    if (lats.length === 0) return [[-60, -180], [75, 180]];
    return [
        [Math.max(-80, Math.min(...lats) - pad), Math.max(-180, Math.min(...lngs) - pad)],
        [Math.min(85, Math.max(...lats) + pad), Math.min(180, Math.max(...lngs) + pad)]
    ];
};

/** Answer keys, sent to participants after submitting. */
export const toAnswerKeys = (round: Round) =>
    round.type === "dictee" ? dicteeAnswerKeys(round.text) :
    round.type === "rekenen" ? rekenenSums(round.text).map(s => formatNumber(s.value)) :
    round.locations.map(l => ({name: l.name, lat: l.lat, lng: l.lng, geometry: l.geometry}));


/* ---------- topo scoring ---------- */

const earthRadiusKm = 6371;
const kmPerDegree = Math.PI * earthRadiusKm / 180;
const toRad = (d: number) => d * Math.PI / 180;
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

export const haversineKm = (a: LatLng, b: LatLng) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
};

type Position = number[]; // GeoJSON: [lng, lat]
type Ring = Position[];

const pointInRing = (lng: number, lat: number, ring: Ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] as [number, number];
        const [xj, yj] = ring[j] as [number, number];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
const pointInPolygon = (lng: number, lat: number, polygon: Ring[]) =>
    polygon.length > 0 && pointInRing(lng, lat, polygon[0]!) &&
    !polygon.slice(1).some(hole => pointInRing(lng, lat, hole));

/** Split a geometry into polygons (which can be clicked inside of) and lines/points (which can only be clicked near). */
const flattenGeometry = (g: Geometry, polygons: Ring[][], lines: Position[][]) => {
    switch (g.type) {
        case "Point": lines.push([g.coordinates]); break;
        case "MultiPoint": for (const p of g.coordinates) lines.push([p]); break;
        case "LineString": lines.push(g.coordinates); break;
        case "MultiLineString": lines.push(...g.coordinates); break;
        case "Polygon": polygons.push(g.coordinates); break;
        case "MultiPolygon": polygons.push(...g.coordinates); break;
        case "GeometryCollection": for (const c of g.geometries ?? []) flattenGeometry(c, polygons, lines); break;
    }
};

/**
 * Find the point on a polyline closest to `origin`, using a local equirectangular projection around `origin`.
 */
const nearestOnPath = (origin: LatLng, path: Position[]) => {
    const cosLat = Math.max(Math.cos(toRad(origin.lat)), 0.01);
    let best = {d2: Infinity, x: 0, y: 0};

    // project, keeping consecutive vertices continuous across the antimeridian
    const pts: [number, number][] = [];
    let prevDLng = 0;
    path.forEach((p, i) => {
        const dLng = i === 0 ? wrapLng(p[0]! - origin.lng) : prevDLng + wrapLng(p[0]! - path[i - 1]![0]!);
        prevDLng = dLng;
        pts.push([dLng * kmPerDegree * cosLat, (p[1]! - origin.lat) * kmPerDegree]);
    });

    const consider = (x: number, y: number) => {
        const d2 = x * x + y * y;
        if (d2 < best.d2) best = {d2, x, y};
    };

    if (pts.length === 1) consider(...pts[0]!);
    for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!;
        const [bx, by] = pts[i]!;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        consider(ax + t * dx, ay + t * dy);
    }

    return {
        lat: origin.lat + best.y / kmPerDegree,
        lng: wrapLng(origin.lng + best.x / (kmPerDegree * cosLat))
    };
};

/**
 * Score a click on the map: full points inside the location (or within `pointRadiusKm()` of a point/line),
 * then linearly decreasing to 0 points at `maxDistanceKm` from the edge.
 */
export const scoreTopoClick = (click: LatLng, location: TopoLocation, maxDistanceKm: number) => {
    const origin = {lat: click.lat, lng: wrapLng(click.lng)};
    const polygons: Ring[][] = [], lines: Position[][] = [];
    flattenGeometry(location.geometry, polygons, lines);

    if (polygons.some(p => pointInPolygon(origin.lng, origin.lat, p)))
        return {distanceKm: 0, score: 1, nearest: null};

    let best: {distanceKm: number, nearest: LatLng | null} = {distanceKm: Infinity, nearest: null};
    const consider = (path: Position[], radius: number) => {
        if (path.length === 0) return;
        const nearest = nearestOnPath(origin, path);
        const distanceKm = Math.max(0, haversineKm(origin, nearest) - radius);
        if (distanceKm < best.distanceKm) best = {distanceKm, nearest};
    };

    for (const polygon of polygons) for (const ring of polygon) consider(ring, 0);
    for (const line of lines) consider(line, pointRadiusKm(maxDistanceKm));

    if (!best.nearest) { // geometry without coordinates, fall back to the center point
        const nearest = {lat: location.lat, lng: location.lng};
        best = {distanceKm: Math.max(0, haversineKm(origin, nearest) - pointRadiusKm(maxDistanceKm)), nearest};
    }

    const score = Math.max(0, Math.min(1, 1 - best.distanceKm / maxDistanceKm));
    return {
        distanceKm: Math.round(best.distanceKm * 10) / 10,
        score: Math.round(score * 100) / 100,
        nearest: best.distanceKm === 0 ? null : best.nearest
    };
};


/* ---------- location search (OpenStreetMap Nominatim) ---------- */

export type SearchResult = {name: string, description: string, category: string, lat: number, lng: number, geometry: Geometry};

let lastSearch = 0;
let searchQueue: Promise<unknown> = Promise.resolve();

/**
 * Search places through Nominatim, including their outline. Requests are serialized to respect
 * the Nominatim usage policy of at most one request per second.
 */
export const searchLocations = (query: string): Promise<SearchResult[]> => {
    const run = async () => {
        const wait = lastSearch + 1100 - Date.now();
        if (wait > 0) await Bun.sleep(wait);
        lastSearch = Date.now();

        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.search = new URLSearchParams({
            q: query, format: "jsonv2", limit: "8",
            polygon_geojson: "1", polygon_threshold: "0.005",
            "accept-language": "nl"
        }).toString();

        const res = await fetch(url, {
            headers: {"User-Agent": `DJO-Dictee/${version} (https://github.com/djoamersfoort/dictee)`},
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error(`OpenStreetMap gaf status ${res.status}`);

        const results: SearchResult[] = [];
        for (const r of await res.json() as any[]) {
            const geometry = sanitizeGeometry(r.geojson) ?? {type: "Point", coordinates: [+r.lon, +r.lat]};
            results.push({
                name: r.name || String(r.display_name).split(",")[0],
                description: r.display_name,
                category: r.addresstype ?? r.type ?? "",
                lat: +r.lat, lng: +r.lon,
                geometry
            });
        }
        return results;
    };

    const result = searchQueue.then(run, run);
    searchQueue = result.catch(() => {});
    return result;
};
