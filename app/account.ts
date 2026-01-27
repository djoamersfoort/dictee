import { join } from "path";
import { readFile } from "fs";

export const verifyAccount = async (base64auth: string) => {
    return new Promise((res, rej) => {
        readFile(join(import.meta.dirname, "..", "data", "examiners.json"), (err, txt) => {
            if (err) rej(err.message);

            const accounts = JSON.parse(new TextDecoder().decode(txt));
            const authToken = /^(Basic )?(.*)$/.exec(base64auth) as string[];
            const [username, password] = atob(authToken[2] as string).split(":") as string[];
            const valid = Bun.password.verifySync(password as string, accounts[username as string] ?? "", "bcrypt");

            if (!accounts[username as string] || !valid)
                rej("Invalid credentials");
            else
                res("");
        });
    });
};
