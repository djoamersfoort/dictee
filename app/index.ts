import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFile, writeFileSync } from "fs";

import { isExaminer } from "./is-examiner";
import { dictee, paths, type State } from "./dictee";


// `data` directory existence check
if (!existsSync(join(import.meta.dirname, "..", "data")))
    mkdirSync(join(import.meta.dirname, "..", "data"));

for (const i of [paths.contentsFile, paths.resultsFile, paths.examinersFile]) {
    if (!existsSync(i)) writeFileSync(i, i.endsWith("json") ? "{}" : "");
}

// Declarations
const port = 7000;
const app = new Hono();
const io = new Server({
    connectionStateRecovery: {maxDisconnectionDuration: 120e3}
});
const engine = new Engine();
const formInput = /\{(.*?)\}/g;

// Socket.IO
const examinerSocketIDs: string[] = [];

const broadcast = (event: string, ...args: any) => {
    io.fetchSockets().then(sockets => {
        sockets.forEach(s => s.emit(event, ...args));
    }).catch(() => {});
};

const broadcastParticipants = (event: string, ...args: any) => {
    const participantSocketIDs = dictee.participants.filter(p => p).map(p => p?.socketID);
    io.fetchSockets().then(sockets => {
        sockets.filter(s => participantSocketIDs.includes(s.id)).forEach(s => s.emit(event, ...args));
    });
};

const broadcastNonParticipants = (event: string, ...args: any) => {
    const participantSocketIDs = dictee.participants.filter(p => p).map(p => p?.socketID);
    io.fetchSockets().then(sockets => {
        sockets.filter(s => !participantSocketIDs.includes(s.id)).forEach(s => s.emit(event, ...args));
    });
};

const broadcastExaminers = (event: string, ...args: any) => {
    io.fetchSockets().then(sockets => {
        sockets.forEach(s => {
            if (examinerSocketIDs.includes(s.id)) s.emit(event, ...args);
        });
    }).catch(() => {});
};

io.bind(engine);
io.on("connection", socket => {
    const auth = socket.client.request.headers.authorization;
    socket.emit("dictee-state", dictee.state, dictee.participants.filter(p => p).length, dictee.isFull());

    socket.on("participate", (firstName: string, lastName: string) => {
        if (!firstName || !lastName) {
            socket.emit("participate-reply", "Niet alle velden zijn ingevuld!");
            return;
        } else if (firstName.charAt(0) != firstName.charAt(0).toUpperCase()) {
            socket.emit("participate-reply", "Je voornaam begint met een ...");
            return;
        } else if (lastName === lastName.toLowerCase()) {
            socket.emit("participate-reply", "Er mist een hoofdletter in je achternaam!");
            return;
        } else if (firstName.match(/\d+/) || lastName.match(/\d+/)) {
            socket.emit("participate-reply", "Getallen horen niet thuis in je naam!");
            return;
        } else if (dictee.isFull()) {
            socket.emit("participate-reply", "Sorry, het dictee zit al vol!");
            return;
        }

        socket.emit("participate-reply", null, dictee.add(firstName, lastName, socket.id));

        broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length, dictee.isFull());
        examinerUpdate();
    });

    socket.on("submit-answers", (answers: string[]) => {
        const sender = dictee.participants.filter(p => p && p.socketID === socket.id)[0];
        if (!sender) return;

        const fetchedAnswerKeys = new TextDecoder().decode(
            readFileSync(join(import.meta.dirname, "..", "data", "contents.txt"))
        ).match(formInput) as string[];

        if (fetchedAnswerKeys.length !== answers.length) return;

        sender.answers = answers;
        examinerUpdate();

        const answerKeys: string[] = [];
        for (const a of fetchedAnswerKeys) answerKeys.push(a.replaceAll(/(\{|\})/g, ""));

        let score = 0;
        answers.forEach((answer, i) => {
            if (answer === answerKeys[i]) score++;
        });
        const grade = (score * 9 / answerKeys.length + 1).toFixed(1);

        const results = JSON.parse(new TextDecoder().decode(
            readFileSync(paths.resultsFile)
        ));
        results[`${sender.firstName} ${sender.lastName}`] = {score, answers};

        writeFile(paths.resultsFile, JSON.stringify(results, null, 4), (err) => {
            if (err) throw err;
            socket.emit("results", score, answerKeys.length, grade, (+grade >= 5.5));

            setTimeout(() => socket.emit("answer-keys", answerKeys), 500);
        });
    });

    socket.conn.on("close", () => {
        const matchingParticipant = dictee.participants.filter(p => p && p.socketID === socket.id)[0];

        if (matchingParticipant) {
            dictee.kick(dictee.participants.indexOf(matchingParticipant));
            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length, dictee.isFull());
        }

        if (examinerSocketIDs.indexOf(socket.id) > -1)
            examinerSocketIDs.splice(examinerSocketIDs.indexOf(socket.id), 1);

        examinerUpdate();
    });

    const examinerUpdate = () => {
        broadcastExaminers("examiner-participants", dictee.participants);
        broadcastExaminers("examiner-state", dictee.state, dictee.participants.filter(p => p).length > 0);
    };

    isExaminer(auth).then(() => {
        if (!examinerSocketIDs.includes(socket.id)) examinerSocketIDs.push(socket.id);

        const contents = new TextDecoder().decode(readFileSync(paths.contentsFile)).split("\n");
        const title = contents.shift();
        if (!contents[contents.length - 1]) contents.pop();

        socket.emit("examiner-contents", title, contents.join("\n"));
        socket.emit("examiner-participants", dictee.participants);
        socket.emit("examiner-state", dictee.state, dictee.participants.filter(p => p).length > 0);

        socket.on("examiner-dictee-update", (body: string) => {
            if (dictee.state !== "closed") return;

            const contents = body + (body.endsWith("\n") ? "" : "\n");
            writeFile(paths.contentsFile, contents, err => {
                socket.emit("examiner-dictee-update-reply", err);

                const contents = body.split("\n");
                const title = contents.shift()?.replaceAll(/\{(.*?)\}/g, "$1");
                broadcastExaminers("examiner-contents", title, contents.join("\n"));
            });
        });

        socket.on("examiner-kick", (who: number) => {
            const kickMessage = "Oei, je bent door de examinator uit het dictee verwijderd.";
            const kickedSocketID = dictee.participants[who]?.socketID;
            dictee.kick(who);

            io.fetchSockets().then(sockets => {
                sockets.filter(s => s.id === kickedSocketID)[0]?.emit("force-quit", kickMessage);
            });
            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length, dictee.isFull());
            examinerUpdate();
        });

        socket.on("examiner-set-state", (to: State) => {
            if (to === "open")
                dictee.setOpen();
            else if (to === "closed")
                dictee.setClosed();
            else if (to === "busy")
                dictee.setBusy();

            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length, dictee.isFull());
            examinerUpdate();

            if (to === "closed") {
                const closeMessage = "Oei, de examinator heeft het dictee afgesloten.";
                broadcast("force-quit", closeMessage);
            } else if (to === "busy") {
                const contents = new TextDecoder().decode(readFileSync(paths.contentsFile));
                const dicteePayload = contents.replaceAll(/\{(.*?)\}/g, "{}");
                broadcastParticipants("dictee-start", dicteePayload);

                const startMessage = "Oei, de examinator heeft het dictee al gestart.";
                broadcastNonParticipants("force-quit", startMessage);
            }
        });
    }).catch(() => {});
});

// Webpage
app.get("/", c => {
    return c.text(new TextDecoder().decode(
        readFileSync(join(import.meta.dirname, "pages", "index.html"))
    ), 200, {"Content-Type": "text/html"});
});

app.get("/examinator", async c => {
    if (c.req.header("Authorization")) {
        const valid = await isExaminer(c.req.header("Authorization")).then(() => true).catch(() => false);

        if (valid) return c.text(new TextDecoder().decode(
            readFileSync(join(import.meta.dirname, "pages", "examiner.html"))
        ), 200, {"Content-Type": "text/html"});
    }

    c.header("WWW-Authenticate", `Basic realm="Login required"`);
    return c.text("401 Joch Detected", 401, {"Content-Type": "text/plain"});
});

app.use("/static/*", serveStatic({root: join(import.meta.dirname, "..")}))

export default {
    ...engine.handler(),
    port,
    idleTimeout: 30,

    fetch(req: Request, server: any) {
        const url = new URL(req.url);

        if (url.pathname === "/socket.io/")
            return engine.handleRequest(req, server);

        return app.fetch(req, server);
    }
};
