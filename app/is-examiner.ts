import { join } from "path";
import { readFile } from "fs";

export const isExaminer = async (base64auth: string | undefined) => {
    return new Promise((res, rej) => {
        readFile(join(import.meta.dirname, "..", "data", "examiners.json"), (err, txt) => {
            if (err) rej(err.message);

            const accounts = JSON.parse(new TextDecoder().decode(txt));
            const authToken = /^(Basic )?(.*)$/.exec(base64auth ?? "") ?? ["", "", ""];
            const [username, password] = atob(authToken[2]).split(":") ?? ["", ""];
            const valid = Bun.password.verifySync(password ?? "", accounts[username ?? ""] ?? "", "bcrypt");

            if (!accounts[username ?? ""] || !valid)
                rej("Joch detected");
            else
                res("");
        });
    });
};
