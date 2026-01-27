import express from "express";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

import { verifyAccount } from "./account";

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

// Dictee
const dictee = {
    states: {
        CLOSED: 0,
        OPEN: 1,
        BUSY: 2
    },
    state: 0,
    participants: [],
    text: ""
};

// Webpage
const port = 7000;
const app = express();

app.use("/static", express.static("static"));

app.get("/", (_req, res) => {
    res.sendFile(join(import.meta.dirname, "pages", "index.html"));
});
app.get("/examinator", (req, res) => {
    if (!req.header("Authorization")) {
        res.setHeader("WWW-Authenticate", `Basic realm="Login required"`)
          .status(401)
          .send("401 Joch Detected");
        return;
    }

    verifyAccount(req.header("Authorization") as string).then(() => {
        res.sendFile(join(import.meta.dirname, "pages", "examiner.html"));
    }).catch(err => {
        res.setHeader("WWW-Authenticate", `Basic realm="Login required"`)
          .status(401)
          .send(`401 ${err}`);
        return;
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
            ws.send(JSON.stringify({act: "state", open: true, waiting: 1}));
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
