const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

function randomName(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "_";

    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }

    return result;
}

function escapeLuaString(str) {
    return str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function obfuscateLua(source) {
    let code = String(source);

    // Remove Lua comments
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");
    code = code.replace(/--[^\r\n]*/g, "");

    // Protect strings before modifying identifiers
    const strings = [];

    code = code.replace(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (match) => {
            const id = strings.length;
            strings.push(match);
            return `___LUA_STRING_${id}___`;
        }
    );

    // Rename common local identifiers
    const reserved = new Set([
        "and", "break", "do", "else", "elseif",
        "end", "false", "for", "function", "goto",
        "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true", "until",
        "while"
    ]);

    const names = new Map();

    code = code.replace(
        /\b(local\s+)([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, prefix, name) => {
            if (reserved.has(name)) return match;

            if (!names.has(name)) {
                names.set(name, randomName(8));
            }

            return prefix + names.get(name);
        }
    );

    // Rename references to variables already discovered
    for (const [oldName, newName] of names.entries()) {
        const regex = new RegExp(
            `\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "g"
        );

        code = code.replace(regex, newName);
    }

    // Restore strings
    code = code.replace(
        /___LUA_STRING_(\d+)___/g,
        (_, index) => {
            const original = strings[Number(index)];

            const content = original.slice(1, -1);
            return `"${escapeLuaString(content)}"`;
        }
    );

    // Remove excessive whitespace
    code = code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n\s*\n/g, "\n")
        .trim();

    const id = crypto.randomBytes(8).toString("hex");

    return `-- Lua OBF ${id}\n${code}`;
}

app.post("/api/obfuscate", async (req, res) => {
    try {
        const { code } = req.body;

        if (typeof code !== "string") {
            return res.status(400).json({
                success: false,
                error: "code must be a string"
            });
        }

        if (!code.trim()) {
            return res.status(400).json({
                success: false,
                error: "Lua code is empty"
            });
        }

        if (code.length > 5 * 1024 * 1024) {
            return res.status(413).json({
                success: false,
                error: "Lua code is too large"
            });
        }

        const result = obfuscateLua(code);

        res.json({
            success: true,
            code: result
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Obfuscation failed"
        });
    }
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "online"
    });
});

app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.listen(PORT, () => {
    console.log(`Lua OBF API running on port ${PORT}`);
});
