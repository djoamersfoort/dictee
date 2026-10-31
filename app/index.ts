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
import { Dictee, Participant, normalizeSubmission, paths, type State, type Cheats, type ResultsFile } from "./dictee";
import {
    loadRounds, saveRounds, sanitizeRounds, validateRound, searchLocations,
    toParticipantRound, toAnswerKeys, roundMaxPoints, type Round
} from "./rounds";
import { version } from "../package.json" with {type: "json"};


// `data` directory existence check
if (!existsSync(join(import.meta.dirname, "..", "data")))
    mkdirSync(join(import.meta.dirname, "..", "data"));

// file existence check
for (const i of [paths.resultsFile, paths.examinersFile])
    if (!existsSync(i)) writeFileSync(i, "{}");

let rounds: Round[] = loadRounds();

// Declarations
const port = 3000;
const app = new Hono();
const io = new Server({
    connectionStateRecovery: {maxDisconnectionDuration: 120e3}
});
const engine = new Engine();
const dictee = new Dictee();

// Socket.IO
const examinerSocketIDs: string[] = [];

/**
 * Store the results of graded participants and send them their result and the answer keys.
 */
const sendResults = (graded: Participant[], onSaved?: () => void) => {
    if (graded.length === 0) return;

    const results: ResultsFile = dictee.getFinishedParticipantData();
    for (const p of graded) if (p.result)
        results[p.socketID] = {firstName: p.firstName, lastName: p.lastName, result: p.result};

    writeFile(paths.resultsFile, JSON.stringify(results, null, 4), (err) => {
        if (err) throw err;
        onSaved?.();
        const keys = dictee.rounds.map(toAnswerKeys);

        io.fetchSockets().then(sockets => {
            for (const p of graded) {
                const s = sockets.find(s => s.id === p.socketID);
                const result = p.result;
                if (!s || !result) continue;

                s.emit("results", result.score, result.total, result.grade, result.passed);
                setTimeout(() => s.emit("answer-keys", keys, result.rounds), 500);
            }
        }).catch(() => {});
    });
};

/** The rounds being taken and which one is current, for the examiner dashboard. */
const liveState = () => ({
    rounds: dictee.getState() === "busy" ? dictee.rounds.map(r => ({id: r.id, type: r.type, title: r.title})) : [],
    currentRound: dictee.currentRound
});

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

    socket.on("submit-answers", (submission: unknown) => {
        // find participant based on socket ID
        const sender = dictee.getParticipantBySocketID(socket.id);
        if (!sender || dictee.getState() !== "busy") return;

        // check their answers, update examiner pages and send the result
        if (!sender.check(submission, dictee.rounds) || !sender.result) return;
        examinerUpdate();
        sendResults([sender], examinerUpdate);
    });

    socket.on("round-answers", (answers: unknown) => {
        const participant = dictee.getParticipantBySocketID(socket.id);
        if (!participant || participant.result || dictee.getState() !== "busy") return;
        if (!Array.isArray(answers) || JSON.stringify(answers).length > 100_000) return;

        participant.draft = answers;
    });

    socket.on("round-progress", (round: unknown, filled: unknown, done: unknown) => {
        const participant = dictee.getParticipantBySocketID(socket.id);
        if (!participant || participant.result || dictee.getState() !== "busy") return;
        if (!Number.isInteger(round) || !Number.isInteger(filled)) return;

        const r = dictee.rounds[round as number];
        if (!r) return;
        const total = roundMaxPoints(r);
        participant.progress[round as number] = {
            filled: Math.max(0, Math.min(filled as number, total)), total, done: done === true
        };
        examinerUpdate();
    });

    // anti-cheat inspired by SweatyCircle439
    socket.on("anticheat-trigger", (trigger: Cheats) => {
        const participant = dictee.getParticipantBySocketID(socket.id);

        if (participant) {
            participant.cheats[trigger]++;
            examinerUpdate();
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
        broadcastExaminers("examiner-dashboard", dictee.getState(), dictee.getParticipantCount() > 0, dictee.lichtkrantAPI,
          rounds.filter(r => r.active).length);
        broadcastExaminers("examiner-live", liveState());
    };

    // examiner only socket events
    isExaminer(auth).then(() => {
        if (!examinerSocketIDs.includes(socket.id)) examinerSocketIDs.push(socket.id);

        socket.emit("examiner-rounds", rounds);
        socket.emit("examiner-participants", dictee.getParticipants(false), dictee.getFinishedParticipantData());
        socket.emit("examiner-dashboard", dictee.getState(), dictee.getParticipantCount() > 0, dictee.lichtkrantAPI,
          rounds.filter(r => r.active).length);
        socket.emit("examiner-live", liveState());

        socket.on("examiner-set-round", (to: unknown) => {
            if (dictee.getState() !== "busy" || !Number.isInteger(to)) return;
            if ((to as number) < 0 || (to as number) >= dictee.rounds.length) return;

            dictee.currentRound = to as number;
            broadcastParticipants("dictee-round", dictee.currentRound);
            examinerUpdate();
        });

        socket.on("examiner-rounds-update", (input: unknown) => {
            if (dictee.getState() !== "closed") {
                socket.emit("examiner-rounds-update-reply", "Sluit het dictee af om het te kunnen bewerken.");
                return;
            }

            const updated = sanitizeRounds(input);
            for (const r of updated) {
                const problem = validateRound(r);
                if (problem) {
                    socket.emit("examiner-rounds-update-reply", `Ronde "${r.title || "zonder titel"}": ${problem}.`);
                    return;
                }
            }

            saveRounds(updated, err => {
                socket.emit("examiner-rounds-update-reply", err?.message ?? null);
                if (err) return;

                rounds = updated;
                broadcastExaminers("examiner-rounds", rounds);
                examinerUpdate();
            });
        });

        socket.on("examiner-location-search", (query: unknown) => {
            if (typeof query !== "string" || !query.trim()) return;

            searchLocations(query.trim().slice(0, 200))
                .then(results => socket.emit("examiner-location-search-reply", query, null, results))
                .catch(err => socket.emit("examiner-location-search-reply", query, String(err?.message ?? err), []));
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
            if (!["closed", "open", "busy", "ended"].includes(to)) return;
            if (to === "ended" && dictee.getState() !== "busy") return;

            if (to === "busy") {
                const active = rounds.filter(r => r.active);
                if (active.length === 0) {
                    socket.emit("examiner-rounds-update-reply", "Er zijn geen actieve rondes om af te nemen.");
                    return;
                }
                dictee.rounds = structuredClone(active);
                dictee.currentRound = 0;
            }
            dictee.setState(to);

            broadcast("dictee-state", dictee.getState(), dictee.getParticipantCount(), Dictee.maxParticipants);
            examinerUpdate();

            if (to === "closed") {
                const closeMessage = "Oei, de examinator heeft het dictee afgesloten.";
                broadcast("force-quit", closeMessage);
            } else if (to === "busy") {
                broadcastParticipants("dictee-start", dictee.rounds.map(toParticipantRound), dictee.currentRound);

                const startMessage = "Oei, de examinator heeft het dictee al gestart.";
                broadcastNonParticipants("force-quit", startMessage);
            } else if (to === "ended") {
                // everyone who did not hand in yet gets graded with their latest answers
                const unfinished = dictee.getParticipants().filter(p => !p.result);
                for (const p of unfinished) p.check(normalizeSubmission(p.draft, dictee.rounds), dictee.rounds);

                broadcastParticipants("dictee-ended");
                sendResults(unfinished, examinerUpdate);
                examinerUpdate();
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
            score: p.result?.score,
            total: p.result?.total,
            grade: p.result?.grade,
            passed: p.result?.passed
        });
    }

    return c.text(
        JSON.stringify(payload, null, 4), 200, {"Content-Type": "application/json"}
    );
});

app.notFound(c => {
    return c.text(new TextDecoder().decode(
        readFileSync(join(import.meta.dirname, "pages", "not-found.html"))
    ), 404, {"Content-Type": "text/html"});
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
