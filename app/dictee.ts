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

export type State = "closed" | "open" | "busy";

export type ResultsFile = {
    [key: string]: { // Socket.IO `id`
        firstName: string,
        lastName: string,
        result: {
            answers: {given: string, correct: boolean}[],
            grade: string, // Number.toFixed(1)
            passed: boolean
        }
    }
};

class Participant {
    firstName: string;
    lastName: string;
    socketID: string;
    result: {
        answers: {given: string, correct: boolean}[],
        grade: string, // Number.toFixed(1)
        passed: boolean
    } | undefined;

    constructor(firstName: string, lastName: string, socketID: string) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.socketID = socketID;
    }

    /**
     * Get the amount of correct answers given by the participant.
     * @returns 0 if not finished yet
     */
    getCorrectAnswerCount() {
        if (!this.result) return 0;

        return this.result.answers.filter(a => a.correct).length;
    }

    /**
     * Compare the given answers of the participant to the correct ones and store them.
     */
    check(givenAnswers: string[], correctAnswers: string[]) {
        if (this.result || givenAnswers.length !== correctAnswers.length) return;

        this.result = {answers: [], grade: "1.0", passed: false};

        givenAnswers.forEach((answer, i) => {
            const correct = (answer === correctAnswers[i]);

            // XSS prevention
            const given = answer
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;");
            this.result?.answers.push({given, correct});
        });

        this.result.grade = (this.getCorrectAnswerCount() * 9 / correctAnswers.length + 1).toFixed(1);
        this.result.passed = (+this.result.grade >= Dictee.passThreshold);
    }
}

export const paths = {
    contentsFile: join(import.meta.dirname, "..", "data", "contents.txt"),
    resultsFile: join(import.meta.dirname, "..", "data", "results.json"),
    examinersFile: join(import.meta.dirname, "..", "data", "examiners.json")
};

export class Dictee {
    static maxParticipants = Number(process.env.MAX_PARTICIPANTS) || 10;
    static passThreshold = Number(process.env.PASS_THRESHOLD) || 5.5;

    #state: State;
    #participants: Participant[];
    lichtkrantAPI: boolean;

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
        return JSON.parse(
            new TextDecoder().decode(readFileSync(paths.resultsFile))
        );
    }
};
