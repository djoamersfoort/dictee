
type Participant = {
    firstName: string,
    lastName: string,
    answers: string[]
};

type Dictee = {
    state: "closed" | "open" | "busy",
    participants: Participant[],
    contents: string
};

export const dictee: Dictee = {
    state: "closed",
    participants: [],
    contents: ""
};
