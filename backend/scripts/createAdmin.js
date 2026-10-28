"use strict";
// One-time command-line setup of the first administrator.  Run:  npm run create-admin
// Reads ADMIN_EMAIL (and optional ADMIN_NAME) from the environment, asks for the password at the prompt.
// Refuses to run if an admin already exists. There is no HTTP endpoint for this.
const readline = require("readline");
const bcrypt = require("bcryptjs");
const { loadEnv } = require("../config/env");
const { connectDb, mongoose } = require("../config/db");
const User = require("../models/User");
const v = require("../utils/validate");

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); }; // hide typed characters
    rl.question(question, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

(async () => {
  const cfg = loadEnv();
  await connectDb(cfg.mongoUri);
  try {
    if (await User.exists({ role: "admin" })) throw new Error("An administrator already exists. Refusing to create another.");
    const email = v.email(process.env.ADMIN_EMAIL, "ADMIN_EMAIL");
    const name = v.text(process.env.ADMIN_NAME || "Administrator", "ADMIN_NAME", { max: 120 });
    const p1 = await askHidden("Choose a password (min 10 characters): ");
    v.newPassword(p1);
    const p2 = await askHidden("Repeat the password: ");
    if (p1 !== p2) throw new Error("Passwords do not match.");
    await User.create({ name, email, passwordHash: await bcrypt.hash(p1, 12), role: "admin", canAssign: true });
    console.log("Administrator account created.");
  } catch (e) {
    console.error("Failed:", e.fields ? Object.values(e.fields).join(" ") : e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
