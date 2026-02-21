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

import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFile, writeFileSync } from "fs";

import { isExaminer } from "./is-examiner";
import { Dictee, paths, type State, type ResultsFile } from "./dictee";
import { version } from "../package.json" with {type: "json"};


// `data` directory existence check
if (!existsSync(join(import.meta.dirname, "..", "data")))
    mkdirSync(join(import.meta.dirname, "..", "data"));

// file existence check
for (const i of [paths.contentsFile, paths.resultsFile, paths.examinersFile]) {
    const content = i.endsWith("json") ? "{}" : "Een titel\nEen {episch} dictee!";
    if (!existsSync(i)) writeFileSync(i, content);
}

// Declarations
const port = 7000;
const app = new Hono();
const io = new Server({
    connectionStateRecovery: {maxDisconnectionDuration: 120e3}
});
const engine = new Engine();
const dictee = new Dictee();
const formInput = /\{(.*?)\}/g;

// Socket.IO
const examinerSocketIDs: string[] = [];

/**
 * Broadcast a message to **all** clients connected to the dictee site.
 */
const broadcast = (event: string, ...args: any) => {
    io.fetchSockets().then(sockets => {
        sockets.forEach(s => s.emit(event, ...args));
    }).catch(() => {});
};

/**
 * Broadcast a message to all clients waiting for or participating in a dictee.
 */
const broadcastParticipants = (event: string, ...args: any) => {
    const participantSocketIDs = dictee.getParticipants().map(p => p?.socketID);
    io.fetchSockets().then(sockets => {
        sockets.filter(s => participantSocketIDs.includes(s.id)).forEach(s => s.emit(event, ...args));
    });
};

/**
 * Broadcast a message to all clients _not_ waiting for or participating in a dictee.
 */
const broadcastNonParticipants = (event: string, ...args: any) => {
    const participantSocketIDs = dictee.getParticipants().map(p => p?.socketID);
    io.fetchSockets().then(sockets => {
        sockets.filter(s => !participantSocketIDs.includes(s.id)).forEach(s => s.emit(event, ...args));
    });
};

/**
 * Broadcast a message to all clients who have authorized themselves as examiner.
 */
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
    socket.emit("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
    socket.emit("dictee-version", version);

    // first/last name validations
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

        broadcast("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
        examinerUpdate();
    });

    socket.on("leave", () => {
        if (dictee.getParticipantBySocketID(socket.id))
            dictee.remove(dictee.getParticipantIndexBySocketID(socket.id));

        examinerUpdate();
    });

    socket.on("submit-answers", (answers: string[]) => {
        // find participant based on socket ID
        const sender = dictee.getParticipantBySocketID(socket.id);
        if (!sender) return;

        // get answer keys and filter the curly braces out
        const fetchedAnswerKeys = new TextDecoder().decode(
            readFileSync(paths.contentsFile)
        ).match(formInput) as string[];

        const answerKeys: string[] = [];
        for (const a of fetchedAnswerKeys) answerKeys.push(a.replaceAll(/(\{|\})/g, ""));

        // check their answers and update examiner pages
        sender.check(answers, answerKeys);
        examinerUpdate();

        // write to results file and send result data to sender
        const results: ResultsFile = JSON.parse(new TextDecoder().decode(
            readFileSync(paths.resultsFile)
        ));
        results[sender.socketID] = {
            firstName: sender.firstName,
            lastName: sender.lastName,
            result: sender.result ?? {answers: [], grade: "1.0", passed: false}
        };

        writeFile(paths.resultsFile, JSON.stringify(results, null, 4), (err) => {
            if (err) throw err;
            socket.emit("results",
                sender.getCorrectAnswerCount(),
                sender.result?.answers.length,
                sender.result?.grade,
                sender.result?.passed
            );

            setTimeout(() => socket.emit("answer-keys", answerKeys), 500);
        });
    });

    socket.on("fullscreen-closed", () => {
        const pid = dictee.getParticipantIndexBySocketID(socket.id);
        const participant = dictee.getParticipantBySocketID(socket.id);

        if (participant && pid !== -1) {
            broadcastExaminers("participant-cheat", participant.firstName, participant.lastName, pid, "fullscreen");
        }
    });

    socket.on("tab-switched", () => {
        const pid = dictee.getParticipantIndexBySocketID(socket.id);
        const participant = dictee.getParticipantBySocketID(socket.id);

        if (participant && pid !== -1) {
            broadcastExaminers("participant-cheat", participant.firstName, participant.lastName, pid, "tab");
        }
    });

    socket.on("tab-switched-back", (time) => {
        const pid = dictee.getParticipantIndexBySocketID(socket.id);
        const participant = dictee.getParticipantBySocketID(socket.id);

        if (participant && pid !== -1) {
            broadcastExaminers("participant-cheat", participant.firstName, participant.lastName, pid, "tab-back", time);
        }
    });

    socket.conn.on("close", () => {
        // if participant, remove from participant list
        if (dictee.getParticipantBySocketID(socket.id)) {
            dictee.remove(dictee.getParticipantIndexBySocketID(socket.id));
            broadcast("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
        }

        // if examiner, remove from authorized socket IDs
        if (examinerSocketIDs.indexOf(socket.id) > -1)
            examinerSocketIDs.splice(examinerSocketIDs.indexOf(socket.id), 1);

        examinerUpdate();
    });

    /**
     * Refresh the examiner webpage, useful to call after a change in the `Dictee` class.
     */
    const examinerUpdate = () => {
        broadcastExaminers("examiner-participants", dictee.getParticipants(false), dictee.getFinishedParticipantData());
        broadcastExaminers("examiner-dashboard", dictee.getState(), dictee.getParticipantCount() > 0, dictee.lichtkrantAPI);
    };

    // examiner only socket events
    isExaminer(auth).then(() => {
        if (!examinerSocketIDs.includes(socket.id)) examinerSocketIDs.push(socket.id);

        const contents = new TextDecoder().decode(readFileSync(paths.contentsFile)).split("\n");
        const title = contents.shift();
        while (contents.length > 0 && contents[contents.length - 1]?.trim().length === 0) contents.pop();

        socket.emit("examiner-contents", title, contents.join("\n"));
        socket.emit("examiner-participants", dictee.getParticipants(false), dictee.getFinishedParticipantData());
        socket.emit("examiner-dashboard", dictee.getState(), dictee.getParticipantCount() > 0, dictee.lichtkrantAPI);

        socket.on("examiner-dictee-update", (body: string) => {
            if (dictee.getState() !== "closed") return;

            const lines = body.split("\n");
            while (lines.length > 0 && lines[lines.length - 1]?.trim().length === 0) lines.pop();

            writeFile(paths.contentsFile, lines.join("\n"), err => {
                socket.emit("examiner-dictee-update-reply", err);

                const title = lines.shift()?.replaceAll(/\{(.*?)\}/g, "$1");
                broadcastExaminers("examiner-contents", title, lines.join("\n"));
            });
        });

        socket.on("examiner-kick", (who: number) => {
            const kickMessage = "Oei, je bent door de examinator uit het dictee verwijderd.";
            const kickedSocketID = dictee.getParticipants(false)[who]?.socketID;
            dictee.remove(who);

            io.fetchSockets().then(sockets => {
                sockets.filter(s => s.id === kickedSocketID)[0]?.emit("force-quit", kickMessage);
            });
            broadcast("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
            examinerUpdate();
        });

        socket.on("examiner-set-state", (to: State) => {
            dictee.setState(to);

            broadcast("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
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
        socket.on("examiner-set-lichtkrant-api", (to: boolean) => {
            dictee.lichtkrantAPI = to;
            examinerUpdate();
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

app.use("/static/*", serveStatic({root: join(import.meta.dirname, "..")}));

app.get("/api/v1/lichtkrant", c => {
    // return empty array if not enabled
    if (!dictee.lichtkrantAPI) return c.text(
        "[]", 200, {"Content-Type": "application/json"}
    );

    const payload = [];
    const range = Object.values(dictee.getFinishedParticipantData());

    // collect data for API and send that
    for (const p of range) {
        payload.push({
            name: p.firstName,
            score: p.result?.answers.filter(a => a.correct).length,
            total: p.result?.answers.length,
            grade: p.result?.grade,
            passed: p.result?.passed
        });
    }

    return c.text(
        JSON.stringify(payload, null, 4), 200, {"Content-Type": "application/json"}
    );
});

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
