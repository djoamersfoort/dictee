import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFile, writeFileSync } from "fs";

import { isExaminer } from "./is-examiner";
import { dictee, type State } from "./dictee";


// `data` directory existence check
if (!existsSync(join(import.meta.dirname, "..", "data")))
    mkdirSync(join(import.meta.dirname, "..", "data"));

for (const i of [
    join(import.meta.dirname, "..", "data", "contents.txt"),
    join(import.meta.dirname, "..", "data", "results.json"),
    join(import.meta.dirname, "..", "data", "examiners.json")
]) {
    if (!existsSync(i)) writeFileSync(i, i.endsWith("json") ? "{}" : "");
}

// Declarations
const port = 7000;
const app = new Hono();
const io = new Server({
    connectionStateRecovery: {maxDisconnectionDuration: 120e3}
});
const engine = new Engine();

// Socket.IO
const broadcast = (event: string, ...args: any) => {
    io.fetchSockets().then(sockets => {
        sockets.forEach(s => s.emit(event, ...args));
    }).catch(() => {});
};

const broadcastExaminers = (auth: string | undefined, event: string, ...args: any) => {
    isExaminer(auth).then(() => broadcast(event, ...args)).catch(() => {});
};

io.bind(engine);
io.on("connection", socket => {
    const auth = socket.client.request.headers.authorization;
    socket.emit("dictee-state", dictee.state, dictee.participants.filter(p => p).length);

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
        } else if (dictee.isFull()) {
            socket.emit("participate-reply", "Sorry, het dictee zit al vol!");
            return;
        }

        socket.emit("participate-reply", null, dictee.add(firstName, lastName, socket.id));
        broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length);
        broadcastExaminers(auth, "examiner-participants", dictee.participants);
    });

    socket.conn.on("close", () => {
        const matchingParticipant = dictee.participants.filter(p => p && p.socketID === socket.id)[0];

        if (matchingParticipant) {
            dictee.kick(dictee.participants.indexOf(matchingParticipant));
            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length);
            broadcastExaminers(auth, "examiner-participants", dictee.participants);
        }
    });

    isExaminer(auth).then(() => {
        const contents = new TextDecoder().decode(readFileSync(join(import.meta.dirname, "..", "data", "contents.txt"))).split("\n");
        const title = contents.shift();
        if (!contents[contents.length - 1]) contents.pop();

        socket.emit("examiner-contents", title, contents.join("\n"));
        socket.emit("examiner-participants", dictee.participants);
        socket.emit("examiner-state", dictee.state);

        socket.on("examiner-dictee-update", (body: string) => {
            const contents = body + (body.endsWith("\n") ? "" : "\n");
            writeFile(join(import.meta.dirname, "..", "data", "contents.txt"), contents, err => {
                socket.emit("examiner-dictee-update-reply", err);

                const contents = body.split("\n");
                const title = contents.shift();
                broadcastExaminers(auth, "examiner-contents", title, contents.join("\n"));
            });
        });

        socket.on("examiner-kick", (who: number) => {
            const kickedSocketID = dictee.participants[who]?.socketID;
            dictee.kick(who);

            io.fetchSockets().then(sockets => {
                sockets.filter(s => s.id === kickedSocketID)[0]?.emit("kicked");
            });
            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length);
            broadcastExaminers(auth, "examiner-participants", dictee.participants);
        });

        socket.on("examiner-set-state", (to: State) => {
            dictee.state = to;
            broadcast("dictee-state", dictee.state, dictee.participants.filter(p => p).length);
            broadcastExaminers(auth, "examiner-state", dictee.state);
        });
    }).catch(() => {});
});

// Webpage
app.get("/", c => {
    return c.text(
        new TextDecoder().decode(readFileSync(join(import.meta.dirname, "pages", "index.html"))),
        200,
        {"Content-Type": "text/html"}
    );
});

app.get("/examinator", async c => {
    if (c.req.header("Authorization")) {
        const valid = await isExaminer(c.req.header("Authorization")).then(() => true).catch(() => false);

        if (valid) return c.text(
            new TextDecoder().decode(readFileSync(join(import.meta.dirname, "pages", "examiner.html"))),
            200,
            {"Content-Type": "text/html"}
        );
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
}
