"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Payment = require("../models/Payment");
const { mongoose } = require("../config/db");

const RECEIPT_DIR = path.resolve(__dirname, "../private-receipts");
const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const LOCK_LEASE_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
const MAX_ORPHAN_CANDIDATES = 5000;
const UUID_FILE = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const LOCK_ID = "payment-receipt-recovery";
const activeReceiptFiles = new Set();
let recoveryRun;
let recoveryTimer;

function reportRecoveryError(message, error, fileId) {
  console.error(`[payments] ${message}`, {
    ...(fileId ? { fileId } : {}),
    name: error?.name || "Error",
    code: error?.code || "unknown",
  });
}

async function assertPrivateDirectory(directory, fileSystem = fs) {
  const resolvedDirectory = path.resolve(directory);
  const info = await fileSystem.lstat(resolvedDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Receipt storage must be a real private directory.");
  }
  const actualDirectory = await fileSystem.realpath(resolvedDirectory);
  if (path.resolve(actualDirectory).toLowerCase() !== resolvedDirectory.toLowerCase()) {
    throw new Error("Receipt storage path must not resolve through a symlink.");
  }
  return resolvedDirectory;
}

async function acquireRecoveryLock(lockCollection, now, reportError) {
  const owner = crypto.randomUUID();
  let result;
  try {
    result = await lockCollection.findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [{ leaseUntil: { $lte: new Date(now) } }, { owner }],
      },
      { $set: { owner, leaseUntil: new Date(now + LOCK_LEASE_MS) } },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
  const lock = result?.value || result;
  if (!lock || lock.owner !== owner) return null;
  return async () => {
    try {
      await lockCollection.deleteOne({ _id: LOCK_ID, owner });
    } catch (error) {
      reportError("Could not release the receipt recovery lease; it will expire automatically.", error);
    }
  };
}

function receiptPathFor(fileId, directory = RECEIPT_DIR) {
  if (typeof fileId !== "string" || !UUID_FILE.test(fileId)) {
    throw new Error("Invalid receipt storage identifier.");
  }
  const resolvedDirectory = path.resolve(directory);
  const filePath = path.resolve(resolvedDirectory, fileId);
  if (path.dirname(filePath).toLowerCase() !== resolvedDirectory.toLowerCase()) {
    throw new Error("Receipt storage path escaped its private directory.");
  }
  return filePath;
}

function beginReceiptOperation(fileId) {
  if (!UUID_FILE.test(fileId) || activeReceiptFiles.has(fileId)) {
    throw new Error("Invalid or duplicate active receipt operation.");
  }
  activeReceiptFiles.add(fileId);
  return () => activeReceiptFiles.delete(fileId);
}

async function sweepOrphanedReceiptFiles({
  directory = RECEIPT_DIR,
  PaymentModel = Payment,
  mongooseInstance = mongoose,
  fileSystem = fs,
  now = Date.now(),
  minimumAgeMs = MIN_ORPHAN_AGE_MS,
  reportError = reportRecoveryError,
  lockCollection,
} = {}) {
  if (mongooseInstance.connection?.readyState !== 1) {
    throw new Error("MongoDB is not ready for receipt recovery.");
  }

  let resolvedDirectory;
  try {
    resolvedDirectory = await assertPrivateDirectory(directory, fileSystem);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  const recoveryLocks = lockCollection || mongooseInstance.connection.collection("maintenanceLocks");
  const releaseLock = await acquireRecoveryLock(recoveryLocks, now, reportError);
  if (!releaseLock) return 0;
  try {
    const entries = await fileSystem.readdir(resolvedDirectory, { withFileTypes: true });
    const staleIds = [];
    for (const entry of entries) {
      if (!entry.isFile() || !UUID_FILE.test(entry.name) || activeReceiptFiles.has(entry.name)) continue;
      try {
        const filePath = receiptPathFor(entry.name, resolvedDirectory);
        const info = await fileSystem.lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink()) continue;
        if (now - info.mtimeMs >= minimumAgeMs) staleIds.push(entry.name);
      } catch (error) {
        if (error.code !== "ENOENT") reportError("Could not inspect a receipt file for recovery.", error, entry.name);
      }
    }

    if (staleIds.length > MAX_ORPHAN_CANDIDATES) {
      throw new Error("Too many orphan-recovery candidates; no files were removed.");
    }

    const referencedIds = new Set();
    for (let offset = 0; offset < staleIds.length; offset += BATCH_SIZE) {
      const batch = staleIds.slice(offset, offset + BATCH_SIZE);
      const records = await PaymentModel.find({
        receiptFileId: mongooseInstance.trusted({ $in: batch }),
      }).select("receiptFileId").lean();
      for (const record of records) referencedIds.add(record.receiptFileId);
    }

    let removed = 0;
    for (const fileId of staleIds) {
      if (referencedIds.has(fileId) || activeReceiptFiles.has(fileId)) continue;
      try {
        await fileSystem.unlink(receiptPathFor(fileId, resolvedDirectory));
        removed += 1;
      } catch (error) {
        if (error.code !== "ENOENT") reportError("Could not remove an orphaned receipt file; recovery will retry.", error, fileId);
      }
    }
    return removed;
  } finally {
    await releaseLock();
  }
}

function removeOrphanedReceiptFiles(options) {
  if (recoveryRun) return recoveryRun;
  recoveryRun = sweepOrphanedReceiptFiles(options).finally(() => {
    recoveryRun = undefined;
  });
  return recoveryRun;
}

function startReceiptRecovery() {
  if (recoveryTimer) return recoveryTimer;
  const sweep = async () => {
    try {
      const removed = await removeOrphanedReceiptFiles();
      if (removed) console.info(`[payments] Removed ${removed} orphaned receipt file(s).`);
    } catch (error) {
      reportRecoveryError("Receipt recovery sweep failed; recovery will retry.", error);
    }
  };

  recoveryTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  recoveryTimer.unref();
  void sweep();
  return recoveryTimer;
}

module.exports = {
  RECEIPT_DIR,
  assertPrivateDirectory,
  beginReceiptOperation,
  receiptPathFor,
  removeOrphanedReceiptFiles,
  startReceiptRecovery,
};
