export type State = "closed" | "open" | "busy";

type Participant = {
    firstName: string,
    lastName: string,
    answers: string[]
};

type Dictee = {
    state: State,
    participants: Array<Participant | undefined>,
    contents: string
};

export const maxParticipants = 10;

export const dictee: Dictee = {
    state: "closed",
    participants: new Array(maxParticipants),
    contents: ""
};
