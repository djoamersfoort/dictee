import express from "express";

// Webpage
const port = 7000;
const app = express();

app.use(express.static("src"));

app.listen(port, () => {
    console.log(`Web server started on port ${port}!`);
});

// WebSocket server
Bun.serve({
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
