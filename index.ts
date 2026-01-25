import express from "express";

const app = express();

app.use(express.static("src"));

app.listen(8080, () => {
    console.log("listening");
});
