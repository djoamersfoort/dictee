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

import { join } from "path";
import { readFileSync, writeFile } from "fs";

import { isCorrectAnswer } from "../static/js/calc.js";
import { gradeCircuit, sanitizeCircuit, emptyCircuit } from "../static/js/circuit.js";
import { dicteeAnswerKeys, rekenenSums, roundMaxPoints, scoreTopoClick, type Round, type RoundResult, type LatLng } from "./rounds";

/** `ended`: the examiner stopped the dictee, everyone got graded, but results are kept until `closed`. */
export type State = "closed" | "open" | "busy" | "ended";
export type Cheats = "fullscreen-exit" | "tab-switch" | "clipboard-use";

export type Result = {
    rounds: RoundResult[],
    score: number, // points, topo answers can give partial points
    total: number,
    grade: string, // Number.toFixed(1)
    passed: boolean
};

export type ResultsFile = {
    [key: string]: { // Socket.IO `id`
        firstName: string,
        lastName: string,
        result: Result
    }
};

const isLatLng = (x: any): x is LatLng =>
    x && typeof x === "object" && Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90;

/**
 * Turn possibly incomplete answers into a valid submission: missing or invalid rounds become empty answers.
 * Used when the examiner ends the dictee before a participant handed in.
 */
export const normalizeSubmission = (submission: unknown, rounds: Round[]) => rounds.map((round, r) => {
    const given = Array.isArray(submission) && Array.isArray(submission[r]) ? submission[r] as unknown[] : [];
    if (round.type === "circuit")
        return round.questions.map((q, i) => given[i] ? sanitizeCircuit(given[i], q.parts) : emptyCircuit());

    const length = round.type === "dictee" ? dicteeAnswerKeys(round.text).length :
        round.type === "rekenen" ? rekenenSums(round.text).length : round.locations.length;

    return Array.from({length}, (_, i) =>
        round.type === "topo" ? (isLatLng(given[i]) ? given[i] : null) :
        (typeof given[i] === "string" ? given[i] : ""));
});

export class Participant {
    firstName: string;
    lastName: string;
    socketID: string;
    result: Result | undefined;
    cheats: {[key in Cheats]: number};
    /** Live progress per round index, shown to examiners. */
    progress: {[round: number]: {filled: number, total: number, done: boolean}} = {};
    /** Latest (not yet handed in) answers, so the examiner can end the dictee for everyone. */
    draft: unknown = null;

    toJSON() {
        const {draft, ...visible} = this; // drafts stay on the server
        return visible;
    }

    constructor(firstName: string, lastName: string, socketID: string) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.socketID = socketID;

        this.cheats = {
            "fullscreen-exit": 0,
            "tab-switch": 0,
            "clipboard-use": 0
        };
    }

    /**
     * Compare the submitted answers of the participant (one array per round) to the correct ones and store them.
     * @returns whether the submission was accepted.
     */
    check(submission: unknown, rounds: Round[]) {
        if (this.result || !Array.isArray(submission) || submission.length !== rounds.length) return false;

        const results: RoundResult[] = [];
        let score = 0, total = 0;

        for (let r = 0; r < rounds.length; r++) {
            const round = rounds[r]!;
            const given = submission[r];
            if (!Array.isArray(given)) return false;

            if (round.type === "dictee") {
                const keys = dicteeAnswerKeys(round.text);
                if (given.length !== keys.length || given.some(g => typeof g !== "string")) return false;

                const answers = keys.map((key, i) => ({given: given[i] as string, correct: given[i] === key}));
                score += answers.filter(a => a.correct).length;
                results.push({type: "dictee", roundID: round.id, answers});
            } else if (round.type === "circuit") {
                if (given.length !== round.questions.length) return false;

                const answers = round.questions.map((q, i) => {
                    const circuit = sanitizeCircuit(given[i], q.parts);
                    return {given: circuit, ...gradeCircuit(q, circuit)};
                });
                score += answers.reduce((sum, a) => sum + a.score, 0);
                results.push({type: "circuit", roundID: round.id, answers});
            } else if (round.type === "rekenen") {
                const sums = rekenenSums(round.text);
                if (given.length !== sums.length || given.some(g => typeof g !== "string")) return false;

                const answers = sums.map((sum, i) => ({given: given[i] as string, correct: isCorrectAnswer(given[i], sum.value)}));
                score += answers.filter(a => a.correct).length;
                results.push({type: "rekenen", roundID: round.id, answers});
            } else {
                if (given.length !== round.locations.length) return false;

                const answers = round.locations.map((location, i) => {
                    const click = isLatLng(given[i]) ? {lat: given[i].lat, lng: given[i].lng} : null;
                    if (!click) return {given: null, distanceKm: null, score: 0, nearest: null};
                    return {given: click, ...scoreTopoClick(click, location, round.maxDistanceKm)};
                });
                score += answers.reduce((sum, a) => sum + a.score, 0);
                results.push({type: "topo", roundID: round.id, answers});
            }
            total += roundMaxPoints(round);
        }

        score = Math.round(score * 100) / 100;
        const grade = total > 0 ? (score * 9 / total + 1).toFixed(1) : "1.0";
        this.result = {rounds: results, score, total, grade, passed: +grade >= Dictee.passThreshold};
        return true;
    }
}

export const paths = {
    resultsFile: join(import.meta.dirname, "..", "data", "results.json"),
    examinersFile: join(import.meta.dirname, "..", "data", "examiners.json")
};

export class Dictee {
    static maxParticipants = Number(process.env.MAX_PARTICIPANTS) || 10;
    static passThreshold = Number(process.env.PASS_THRESHOLD) || 5.5;

    #state: State;
    #participants: Participant[];
    lichtkrantAPI: boolean;
    /** Snapshot of the active rounds, taken when the dictee starts. */
    rounds: Round[] = [];
    /** Index (in `rounds`) of the round participants are currently working on, set by examiners. */
    currentRound = 0;

    constructor() {
        this.#state = "closed";
        this.#participants = new Array(Dictee.maxParticipants);
        this.lichtkrantAPI = false;
    }

    /**
     * Add a new participant to the dictee.
     * @returns the participant ID, used by examiners to identify the actual person who joined.
     */
    add(firstName: string, lastName: string, socketID: string) {
        let i;
        for (i=0; i<Dictee.maxParticipants; i++) {
            if (!this.#participants[i]) {
                this.#participants[i] = new Participant(firstName, lastName, socketID);
                break;
            }
        }
        return i;
    }
    /**
     * Remove a participant from the dictee.
     */
    remove(index: number) {
        delete this.#participants[index];
    }
    /**
     * Check whether the dictee reached `Dictee.maxParticipants` participants.
     */
    isFull() {
        return this.getParticipantCount() === Dictee.maxParticipants;
    }

    /**
     * Get the current dictee state.
     * @returns `"closed"` if not available, `"open"` if participants can join and `"busy"` if the dictee has started.
     */
    getState() {
        return this.#state;
    }
    /**
     * Update the dictee state.
     */
    setState(to: State) {
        if (to === "closed") writeFile(paths.resultsFile, "{}", err => {
            if (err) throw err;

            this.lichtkrantAPI = false;
            for (let i=0; i<this.#participants.length; i++) this.remove(i);
        });

        this.#state = to;
    }

    /**
     * Get the array of participants.
     * @param filtered Whether the empty participant slots should be removed from the returned array.
     */
    getParticipants(filtered: boolean = true) {
        return filtered ? this.#participants.filter(p => p) : this.#participants;
    }
    /**
     * Get the amount of participants who are currently waiting or busy.
     */
    getParticipantCount() {
        return this.getParticipants().length;
    }
    /**
     * Get a participant **index** based on their Socket.IO `id`.
     */
    getParticipantIndexBySocketID(socketID: string) {
        const participant = this.#participants.filter(p => p && p.socketID === socketID)[0];

        return participant ? this.#participants.indexOf(participant) : -1;
    }
    /**
     * Get a participant based on their Socket.IO `id`.
     */
    getParticipantBySocketID(socketID: string) {
        return this.#participants[this.getParticipantIndexBySocketID(socketID)];
    }

    /**
     * Get all the data of participants who already finished the dictee.
     * @returns the contents from `paths.resultsFile`.
     */
    getFinishedParticipantData(): ResultsFile {
        try {
            const data: ResultsFile = JSON.parse(
                new TextDecoder().decode(readFileSync(paths.resultsFile))
            );
            // drop results stored by versions without rounds
            for (const key of Object.keys(data))
                if (!Array.isArray(data[key]?.result?.rounds)) delete data[key];
            return data;
        } catch (err) {
            return {};
        }
    }
};
