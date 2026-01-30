import express from "express";
import session from "express-session";

// soon™
// import { Server as Engine } from "@socket.io/bun-engine";
// import { Server } from "socket.io";

import { join } from "path";
import { existsSync, mkdirSync, writeFile, writeFileSync } from "fs";

import { verifyAccount } from "./account";
import { dictee } from "./dictee";


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

// Webpage
const port = 7000;
const app = express();

app.use("/static", express.static("static"));
app.use(session({
    secret: process.env.SESSION_SECRET ?? "Groot Dictee Des DJO'sch",
    cookie: {maxAge: 60000},
    resave: false,
    saveUninitialized: true
}));

app.get("/", (_req, res) => {
    res.sendFile(join(import.meta.dirname, "pages", "index.html"));
});

app.get("/examinator", (req, res) => {
    verifyAccount(req.header("Authorization") ?? "").then(() => {
        res.sendFile(join(import.meta.dirname, "pages", "examiner.html"));
    }).catch(err => {
        res.setHeader("WWW-Authenticate", `Basic realm="Login required"`)
          .status(401)
          .send(`401 ${err}`);
    });
});

// API calls
app.post("/api/v1/participate", (req, res) => {
    let payload = "";
    req.on("data", e => payload += new TextDecoder().decode(e));
    req.on("end", () => {
        const json: {firstName: string, lastName: string} = JSON.parse(payload);

        if (!json.firstName || !json.lastName) {
            res.status(400).send("Niet alle velden zijn ingevuld!");
            return;
        } else if (json.firstName.charAt(0) != json.firstName.charAt(0).toUpperCase()) {
            res.status(400).send("Je voornaam begint met een ...");
            return;
        } else if (json.lastName === json.lastName.toLowerCase()) {
            res.status(400).send("Er mist een hoofdletter in je achternaam!");
            return;
        }

        const id = dictee.participants.push({
            firstName: json.firstName,
            lastName: json.lastName,
            answers: []
        });

        // @ts-ignore
        req.session.participantID = id;
        res.setHeader("Content-Type", "application/json").status(201).send(JSON.stringify({id}));
    });
});

app.post("/api/v1/examiner/write-contents", (req, res) => {
    verifyAccount(req.header("Authorization") ?? "").then(() => {
        let payload = "";
        req.on("data", e => payload += new TextDecoder().decode(e));
        req.on("end", () => {
            writeFile(join(import.meta.dirname, "..", "data", "contents.txt"), payload, err => {
                if (err)
                    res.status(500).send(`500 ${err.message}`);
                else
                    res.status(204).send("");
            });
        });
    }).catch(() => {
        res.status(401).send(`401 Joch detected`);
    });
});
app.delete("/api/v1/examiner/kick-participant", (req, res) => {
    verifyAccount(req.header("Authorization") ?? "").then(() => {
        let payload = "";
        req.on("data", e => payload += new TextDecoder().decode(e));
        req.on("end", () => {

        });
    }).catch(() => {
        res.status(401).send(`401 Joch detected`);
    });
});
app.patch("/api/v1/examiner/set-state", (req, res) => {
    verifyAccount(req.header("Authorization") ?? "").then(() => {
        let payload = "";
        req.on("data", e => payload += new TextDecoder().decode(e));
        req.on("end", () => {

        });
    }).catch(() => {
        res.status(401).send(`401 Joch detected`);
    });
});

app.listen(port, () => {
    console.log(`Web server started on port ${port}!`);
});

// WebSocket server
const wss = Bun.serve({
    port: port + 1,
    fetch(req, server) {
        const success = server.upgrade(req, {data: ""});

        if (success) return;
        return new Response("That's no WebSocket!");
    },
    websocket: {
        data: {},
        open(ws) {
            console.log("open");
            ws.send(JSON.stringify({act: "state", open: true, waiting: 2}));
        },
        close(ws) {
            console.log("shut");
        },
        async message(ws, message) {
            console.log(`message ${message}`);
            ws.send(`je bent zelf ${message}`);
        },

    }
});
console.log(`WebSocket server started on port ${wss.port}!`);
