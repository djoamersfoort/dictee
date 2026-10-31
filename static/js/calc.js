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

// Calculator for "rekenen" rounds, shared by the server and the examiner page.
// Parses sums like "12 × 7", "(3 + 4) * 2", "144 : 12" or "2^10" without using eval.

const operators = {
    "+": "+", "-": "-", "−": "-",
    "*": "×", "×": "×", "x": "×", "X": "×", "·": "×",
    "/": ":", ":": ":", "÷": ":",
    "^": "^"
};

/**
 * @param {string} input
 * @returns {{value: number, display: string}} the outcome, and the sum written down neatly
 * @throws {Error} with a (Dutch) description when the sum is invalid
 */
export const evaluateSum = (input) => {
    /** @type {string[]} */
    const tokens = [];
    const re = /\s*(\d+(?:[.,]\d+)?|[()+\-−*×xX·\/:÷^])/y;
    let pos = 0;
    while (pos < input.trimEnd().length) {
        re.lastIndex = pos;
        const m = re.exec(input);
        if (!m) throw new Error(`onbekend teken "${input.slice(pos).trim()[0]}"`);
        tokens.push(m[1]);
        pos = re.lastIndex;
    }
    if (tokens.length === 0) throw new Error("lege som");

    let i = 0;
    const peek = () => tokens[i];
    /** @type {(t: string | undefined, ...ops: string[]) => boolean} */
    const isOp = (t, ...ops) => t !== undefined && t in operators && ops.includes(operators[t]);

    // grammar: expr = term (("+" | "-") term)*; term = power (("×" | ":") power)*; power = unary ("^" power)?
    const expr = () => {
        let left = term();
        while (isOp(peek(), "+", "-")) {
            const op = operators[tokens[i++]];
            const right = term();
            left = {value: op === "+" ? left.value + right.value : left.value - right.value, display: `${left.display} ${op === "-" ? "−" : "+"} ${right.display}`};
        }
        return left;
    };
    const term = () => {
        let left = power();
        while (isOp(peek(), "×", ":")) {
            const op = operators[tokens[i++]];
            const right = power();
            if (op === ":" && right.value === 0) throw new Error("delen door nul");
            left = {value: op === "×" ? left.value * right.value : left.value / right.value, display: `${left.display} ${op} ${right.display}`};
        }
        return left;
    };
    const power = () => {
        const base = unary();
        if (isOp(peek(), "^")) {
            i++;
            const exponent = power();
            return {value: base.value ** exponent.value, display: `${base.display}^${exponent.display}`};
        }
        return base;
    };
    const unary = () => {
        if (isOp(peek(), "-")) {
            i++;
            const inner = unary();
            return {value: -inner.value, display: `−${inner.display}`};
        }
        const t = tokens[i++];
        if (t === "(") {
            const inner = expr();
            if (tokens[i++] !== ")") throw new Error("haakjes kloppen niet");
            return {value: inner.value, display: `(${inner.display})`};
        }
        if (t !== undefined && /^\d/.test(t)) return {value: Number(t.replace(",", ".")), display: t.replace(".", ",")};
        throw new Error(t === undefined ? "som is niet af" : `onverwacht "${t}"`);
    };

    const result = expr();
    if (i < tokens.length) throw new Error(`onverwacht "${tokens[i]}"`);
    if (!Number.isFinite(result.value)) throw new Error("uitkomst is te groot");
    if (Math.abs(result.value * 100 - Math.round(result.value * 100)) > 1e-6)
        throw new Error("uitkomst heeft meer dan 2 decimalen");

    return {value: Math.round(result.value * 100) / 100, display: result.display};
};

/**
 * Split a round text into its sums (one per line, empty lines ignored).
 * @param {string} text
 * @returns {string[]}
 */
export const sumLines = (text) => text.split("\n").map(l => l.trim()).filter(l => l);

/**
 * Format a number the Dutch way, e.g. 3.5 → "3,5".
 * @param {number} n
 */
export const formatNumber = (n) => String(n).replace(".", ",");

/**
 * Parse an answer typed by a participant, accepting both "3,5" and "3.5".
 * @param {unknown} input
 * @returns {number | null}
 */
export const parseAnswer = (input) => {
    const cleaned = String(input).trim().replaceAll(" ", "").replace("−", "-").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    return Number(cleaned);
};

/**
 * @param {unknown} given
 * @param {number} value
 */
export const isCorrectAnswer = (given, value) => {
    const n = parseAnswer(given);
    return n !== null && Math.abs(n - value) < 1e-9;
};
