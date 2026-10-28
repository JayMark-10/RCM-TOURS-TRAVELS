"use strict";
const crypto = require("crypto");

// 32 random bytes -> 43 URL-safe characters. Used for session ids and setup keys.
const newToken = () => crypto.randomBytes(32).toString("base64url");

// Only the SHA-256 hash is stored. The inputs are long random values, so a fast hash is appropriate
// (unlike passwords, which use bcrypt).
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

module.exports = { newToken, hashToken };
