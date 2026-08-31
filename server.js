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

function obfuscateLua(source) {
    let code = String(source);

    // ลบ comment
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");
    code = code.replace(/--[^\r\n]*/g, "");

    // เก็บ string เอาไว้ก่อน
    const strings = [];

    code = code.replace(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (match) => {
            const id = strings.length;
            strings.push(match);
            return `___LUA_STRING_${id}___`;
        }
    );

    const reserved = new Set([
        "and", "break", "do", "else", "elseif",
        "end", "false", "for", "function", "goto",
        "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true",
        "until", "while"
    ]);

    const names = new Map();

    code = code.replace(
        /\b(local\s+)([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, prefix, name) => {
            if (reserved.has(name)) {
                return match;
            }

            if (!names.has(name)) {
                names.set(name, randomName(8));
            }

            return prefix + names.get(name);
        }
    );

    for (const [oldName, newName] of names.entries()) {
        const escaped = oldName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        code = code.replace(
            new RegExp(`\\b${escaped}\\b`, "g"),
            newName
        );
    }

    // คืน string
    code = code.replace(
        /___LUA_STRING_(\d+)___/g,
        (_, index) => strings[Number(index)]
    );

    code = code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n\s*\n/g, "\n")
        .trim();

    const id = crypto.randomBytes(8).toString("hex");

    return `-- Lua OBF ${id}\n${code}`;
}

app.post("/api/obfuscate", (req, res) => {
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Lua OBF API running on port ${PORT}`);
});
