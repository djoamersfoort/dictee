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
    contents: string,
    add: (firstName: string, lastName: string, socketID: string) => number,
    kick: (index: number) => void,
    isFull: () => boolean
};

export const maxParticipants = 10;

export const dictee: Dictee = {
    state: "closed",
    participants: new Array(maxParticipants),
    contents: "",
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
    }
};
