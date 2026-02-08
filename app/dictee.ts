import { join } from "path";

export type State = "closed" | "open" | "busy";

type Participant = {
    firstName: string,
    lastName: string,
    answers: string[],
    socketID: string
};

type Dictee = {
    state: State,
    participants: Array<Participant | undefined>,
    add: (firstName: string, lastName: string, socketID: string) => number,
    kick: (index: number) => void,
    isFull: () => boolean,
    setOpen: () => void,
    setClosed: () => void,
    setBusy: () => void
};

const maxParticipants = 10;

export const paths = {
    contentsFile: join(import.meta.dirname, "..", "data", "contents.txt"),
    resultsFile: join(import.meta.dirname, "..", "data", "results.json"),
    examinersFile: join(import.meta.dirname, "..", "data", "examiners.json")
};

export const dictee: Dictee = {
    state: "closed",
    participants: new Array(maxParticipants),
    add(firstName: string, lastName: string, socketID: string) {
        let i;
        for (i=0; i<maxParticipants; i++) {
            if (!this.participants[i]) {
                this.participants[i] = {firstName, lastName, socketID, answers: []};
                break;
            }
        }
        return i;
    },
    kick(index: number) {
        delete this.participants[index];
    },
    isFull() {
        return this.participants.filter(p => p).length === maxParticipants;
    },

    setOpen() {
        this.state = "open";
    },
    setClosed() {
        this.state = "closed";
        for (let i=0; i<this.participants.length; i++) this.kick(i);
    },
    setBusy() {
        this.state = "busy";
    }
};
