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

import { readFile } from "fs";

import { paths } from "./dictee";


/**
 * Check whether a user has authenticated themselves as an examiner, regardless of their `location.pathname`.
 * @param base64auth The value from the `Authorization` header. The `Basic` prefix is optional.
 */
export const isExaminer = async (base64auth: string | undefined) => {
    return new Promise((res, rej) => {
        readFile(paths.examinersFile, (err, txt) => {
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
