const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

/* =========================
   Middleware
========================= */

app.use(express.json({
    limit: "5mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "5mb"
}));

/* =========================
   Static Website
========================= */

app.use(express.static(
    path.join(__dirname, "public")
));

/* =========================
   Random Name
========================= */

function randomName(length = 10) {

    const chars =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    let result = "_";

    for (let i = 0; i < length; i++) {

        result +=
            chars[
                Math.floor(
                    Math.random() * chars.length
                )
            ];
    }

    return result;
}

/* =========================
   Lua Obfuscator
========================= */

function obfuscateLua(source) {

    let code = String(source);

    /*
        Remove block comments
        --[[
            comment
        ]]
    */

    code = code.replace(
        /--\[\[[\s\S]*?\]\]/g,
        ""
    );

    /*
        Remove normal comments
        -- comment
    */

    code = code.replace(
        /--[^\r\n]*/g,
        ""
    );

    /*
        Protect strings
    */

    const strings = [];

    code = code.replace(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (match) => {

            const id = strings.length;

            strings.push(match);

            return `___LUA_STRING_${id}___`;
        }
    );

    /*
        Lua reserved keywords
    */

    const reserved = new Set([

        "and",
        "break",
        "do",
        "else",
        "elseif",
        "end",
        "false",
        "for",
        "function",
        "goto",
        "if",
        "in",
        "local",
        "nil",
        "not",
        "or",
        "repeat",
        "return",
        "then",
        "true",
        "until",
        "while"

    ]);

    /*
        Variable mapping
    */

    const names = new Map();

    /*
        Find local variables
    */

    code = code.replace(
        /\b(local\s+)([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, prefix, name) => {

            if (reserved.has(name)) {
                return match;
            }

            if (!names.has(name)) {

                names.set(
                    name,
                    randomName(8)
                );
            }

            return (
                prefix +
                names.get(name)
            );
        }
    );

    /*
        Rename references
    */

    for (
        const [oldName, newName]
        of names.entries()
    ) {

        const escaped =
            oldName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

        const regex =
            new RegExp(
                `\\b${escaped}\\b`,
                "g"
            );

        code =
            code.replace(
                regex,
                newName
            );
    }

    /*
        Restore strings
    */

    code = code.replace(
        /___LUA_STRING_(\d+)___/g,
        (_, index) => {

            return strings[
                Number(index)
            ];
        }
    );

    /*
        Clean whitespace
    */

    code = code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n\s*\n/g, "\n")
        .trim();

    /*
        Generate unique ID
    */

    const id =
        crypto
            .randomBytes(8)
            .toString("hex");

    return (
        `-- Lua OBF ${id}\n` +
        code
    );
}

/* =========================
   POST /api/obfuscate
========================= */

app.post(
    "/api/obfuscate",
    (req, res) => {

        try {

            const code =
                req.body?.code;

            /*
                Validate input
            */

            if (
                typeof code !== "string"
            ) {

                return res.status(400).json({
                    success: false,
                    error: "code must be a string"
                });
            }

            /*
                Empty code
            */

            if (!code.trim()) {

                return res.status(400).json({
                    success: false,
                    error: "Lua code is empty"
                });
            }

            /*
                Maximum size
            */

            if (
                code.length >
                5 * 1024 * 1024
            ) {

                return res.status(413).json({
                    success: false,
                    error: "Lua code is too large"
                });
            }

            /*
                Obfuscate
            */

            const result =
                obfuscateLua(code);

            /*
                Response
            */

            return res.json({

                success: true,

                code: result

            });

        } catch (error) {

            console.error(
                "OBF ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Obfuscation failed"

            });
        }
    }
);

/* =========================
   GET /api/health
========================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            status: "online",

            service: "Lua OBF API",

            time:
                new Date().toISOString()

        });
    }
);

/* =========================
   API Information
========================= */

app.get(
    "/api",
    (req, res) => {

        res.json({

            success: true,

            name: "Lua OBF API",

            version: "1.0.0",

            endpoints: {

                health:
                    "GET /api/health",

                obfuscate:
                    "POST /api/obfuscate"

            }

        });
    }
);

/* =========================
   404 API
========================= */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            error: "API endpoint not found"

        });
    }
);

/* =========================
   Website Fallback
========================= */

app.use(
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

/* =========================
   Error Handler
========================= */

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                "Internal server error"

        });
    }
);

/* =========================
   Start Server
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Lua OBF API running on port ${PORT}`
        );

        console.log(
            `Port: ${PORT}`
        );
    }
);
