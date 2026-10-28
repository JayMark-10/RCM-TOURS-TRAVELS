"use strict";

// Integration tests erase their collections. Accept only a local MongoDB
// instance with the exact disposable database name used by the test docs.
function isSafeTestDatabase(uri, optIn) {
  if (optIn !== "1" || typeof uri !== "string" || !uri.trim()) return false;
  try {
    const parsed = new URL(uri);
    if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) return false;
    const databasePath = decodeURIComponent(parsed.pathname);
    const hosts = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return databasePath === "/rcm_test" && ["localhost", "127.0.0.1", "::1"].includes(hosts);
  } catch {
    return false;
  }
}

module.exports = { isSafeTestDatabase };
