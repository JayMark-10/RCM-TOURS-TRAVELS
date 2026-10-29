"use strict";

async function sendActivationCode(cfg, to, code) {
  if (typeof cfg.sendEmail === "function") return cfg.sendEmail(to, code);
  console.warn("[email] Activation delivery is disabled.");
  return false;
}

module.exports = { sendActivationCode };
