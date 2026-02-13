import { join } from "path";

export type State = "closed" | "open" | "busy";

class Participant {
    firstName: string;
    lastName: string;
    socketID: string;
    result: {
        answers: {given: string, correct: boolean}[],
        grade: string, // toFixed(1) string
        passed: boolean
    } | undefined;

    constructor(firstName: string, lastName: string, socketID: string) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.socketID = socketID;
    }

    getFullName() {
        return `${this.firstName} ${this.lastName}`;
    }

    getCorrectAnswerCount() {
        if (!this.result) return 0;

        return this.result.answers.filter(a => a.correct).length;
    }

    check(givenAnswers: string[], correctAnswers: string[]) {
        if (this.result || givenAnswers.length !== correctAnswers.length) return;

        this.result = {answers: [], grade: "1.0", passed: false};

        givenAnswers.forEach((given, i) => {
            const correct = (given === correctAnswers[i]);
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
    static maxParticipants = 10;
    static passThreshold = 5.5;

    #state: State;
    #participants: Participant[];
    lichtkrantAPI: boolean;

    constructor() {
        this.#state = "closed";
        this.#participants = new Array(Dictee.maxParticipants);
        this.lichtkrantAPI = false;
    }

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
    remove(index: number) {
        delete this.#participants[index];
    }
    isFull() {
        return this.getParticipantCount() === Dictee.maxParticipants;
    }

    getState() {
        return this.#state;
    }
    setState(to: State) {
        if (to === "closed") {
            this.lichtkrantAPI = false;
            for (let i=0; i<this.#participants.length; i++) this.remove(i);
        }

        this.#state = to;
    }

    getParticipants(filtered: boolean = true) {
        return filtered ? this.#participants.filter(p => p) : this.#participants;
    }
    getParticipantCount() {
        return this.getParticipants().length;
    }
    getParticipantIndexBySocketID(socketID: string) {
        const participant = this.#participants.filter(p => p && p.socketID === socketID)[0];

        return participant ? this.#participants.indexOf(participant) : -1;
    }
    getParticipantBySocketID(socketID: string) {
        return this.#participants[this.getParticipantIndexBySocketID(socketID)];
    }
};
