"use strict";

const dns = require("node:dns");

// Windows' configured resolver can refuse Node's SRV query even when the same
// cluster resolves through a public recursive resolver. Match server startup
// for local CLI scripts; hosted environments retain their platform resolver.
function configureLocalDns(cfg) {
  if (cfg.nodeEnv !== "production") dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

module.exports = { configureLocalDns };
