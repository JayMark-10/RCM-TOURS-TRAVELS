"use strict";
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const AppError = require("../utils/AppError");
const { mongoose } = require("../config/db");
const Request = require("../models/Request");
const RequestFile = require("../models/RequestFile");
const { logEvent } = require("../services/securityLog");
const { withMongoTransaction } = require("../services/mongoTransaction");
const STORAGE = path.join(__dirname, "..", "private-documents");
const MAX_SIZE = 20 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;
const MAX_TOTAL_SIZE_PER_REQUEST = 100 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "application/pdf"]);

function authorized(req, request) {
  if (!request) return false;
  if (req.user.role === "admin") return true;
  if (req.user.role === "customer") return String(request.customerId) === String(req.user._id);
  return !request.assignedTo || String(request.assignedTo) === String(req.user._id);
}
function authorizationFilter(req) {
  if (req.user.role === "customer") return { customerId: req.user._id };
  if (req.user.role === "staff") {
    return { assignedTo: req.user._id };
  }
  return {};
}
async function assertMutationAuthorization(req, request) {
  if (req.user.role === "staff" && String(request?.assignedTo || "") !== String(req.user._id)) {
    await logEvent(req, "request_assignment_denied", {
      userId: req.user._id,
      entityType: "Request",
      entityId: request?._id || req.params.id,
      outcome: "denied",
      detail: `${request?.ref || req.params.id}: document upload`,
    });
    throw new AppError(403, "You must be assigned to this request to upload documents.");
  }
  if (!authorized(req, request)) throw new AppError(404, "Request not found.");
}
function isAmbiguousCommit(error) {
  return error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
    error?.errorLabels?.includes("UnknownTransactionCommitResult");
}
async function removeUncommittedFile(storagePath, storageId) {
  try {
    await fs.unlink(storagePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[requests] Could not remove an uncommitted document; manual storage review may be required.", {
        storageId,
        name: error.name || "Error",
        code: error.code || "unknown",
      });
    }
  }
}
function safeName(value) {
  if (typeof value !== "string") throw new AppError(400, "Invalid file name.");
  const name = path.basename(value.replace(/[\\/]/g, "_")).replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180);
  if (!name) throw new AppError(400, "Invalid file name.");
  return name;
}
function validBytes(type, b) {
  if (type === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/webp") return b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  if (type === "image/gif") return /^GIF8[79]a/.test(b.toString("ascii", 0, 6));
  if (type === "video/mp4") return b.toString("ascii", 4, 8) === "ftyp";
  if (type === "application/pdf") return b.toString("ascii", 0, 5) === "%PDF-";
  return false;
}
async function load(req, { forMutation = false } = {}) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new AppError(404, "Request not found.");
  const request = await Request.findById(req.params.id).select("customerId assignedTo documents ref").lean();
  if (!request) throw new AppError(404, "Request not found.");
  if (forMutation && req.user.role === "staff" && String(request.assignedTo || "") !== String(req.user._id)) {
    await assertMutationAuthorization(req, request);
  }
  if (!authorized(req, request)) throw new AppError(404, "Request not found.");
  return request;
}
async function authorizeUpload(req, _res, next) {
  req.uploadRequest = await load(req, { forMutation: true });
  await assertMutationAuthorization(req, req.uploadRequest);
  next();
}
async function withDocumentUploadLock(requestId, action) {
  const token = crypto.randomUUID();
  const now = new Date();
  const lock = await Request.findOneAndUpdate({
    _id: requestId,
    $or: [
      { documentUploadLockUntil: null },
      { documentUploadLockUntil: mongoose.trusted({ $lt: now }) },
    ],
  }, {
    $set: {
      documentUploadLockToken: token,
      documentUploadLockUntil: new Date(now.getTime() + 5 * 60_000),
    },
  }, { returnDocument: "after" });
  if (!lock) throw new AppError(409, "Another file upload is in progress. Please retry shortly.");
  try {
    return await action(token);
  } finally {
    await Request.updateOne(
      { _id: requestId, documentUploadLockToken: token },
      { $unset: { documentUploadLockToken: 1, documentUploadLockUntil: 1 } }
    );
  }
}
async function list(req, res) {
  const request = await load(req);
  const files = await RequestFile.find({ requestId: request._id }).sort({ createdAt: 1 }).lean();
  const represented = new Set(files.map((file) => file.originalName));
  res.json({ files: files.map((file) => ({ id: String(file._id), name: file.originalName, type: file.mimeType, size: file.size, preview: file.mimeType.startsWith("image/") || file.mimeType === "video/mp4", url: `/api/requests/${request._id}/documents/${file._id}` })), legacyNames: (request.documents || []).filter((name) => !represented.has(name)) });
}
async function upload(req, res) {
  const request = req.uploadRequest || await load(req, { forMutation: true });
  await assertMutationAuthorization(req, request);
  const body = req.body;
  if (!body || typeof body.data !== "string" || typeof body.type !== "string" || !TYPES.has(body.type)) throw new AppError(400, "Choose a supported image, video, or PDF file.");
  const match = /^data:([\w/+.-]+);base64,([A-Za-z\d+/]+=*)$/.exec(body.data);
  if (!match || match[1] !== body.type) throw new AppError(400, "Invalid file data.");
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > MAX_SIZE || !validBytes(body.type, data)) throw new AppError(400, "The file is too large or does not match its declared type.");
  const originalName = safeName(body.name);
  const createdFile = await withDocumentUploadLock(request._id, async (lockToken) => {
    const currentRequest = await Request.findById(request._id)
      .select("customerId assignedTo ref")
      .lean();
    await assertMutationAuthorization(req, currentRequest);

    const existingFiles = await RequestFile.find({ requestId: request._id })
      .select("size")
      .limit(MAX_FILES_PER_REQUEST + 1)
      .lean();
    if (existingFiles.length >= MAX_FILES_PER_REQUEST) {
      throw new AppError(409, "This request has reached its 20-file upload limit.");
    }
    const currentBytes = existingFiles.reduce((total, file) => total + file.size, 0);
    if (currentBytes + data.length > MAX_TOTAL_SIZE_PER_REQUEST) {
      throw new AppError(409, "Files for a request cannot exceed 100 MiB in total.");
    }
    const storageId = crypto.randomUUID();
    const storagePath = path.join(STORAGE, storageId);
    await fs.mkdir(STORAGE, { recursive: true });
    let storageHandle;
    try {
      storageHandle = await fs.open(storagePath, "wx", 0o600);
      await storageHandle.writeFile(data);
      await storageHandle.close();
    } catch (error) {
      if (storageHandle) {
        await storageHandle.close().catch(() => {});
        await fs.unlink(storagePath).catch(() => {});
      }
      throw error;
    }
    let createdFile;
    try {
      createdFile = await withMongoTransaction(mongoose, async (session) => {
        const [file] = await RequestFile.create([{
          requestId: request._id,
          customerId: currentRequest.customerId,
          uploadedBy: req.user._id,
          storageId,
          originalName,
          mimeType: body.type,
          size: data.length,
        }], { session });
        const commit = await Request.updateOne(
          {
            _id: request._id,
            documentUploadLockToken: lockToken,
            ...authorizationFilter(req),
          },
          { $push: { documents: originalName }, $unset: { documentUploadLockToken: 1, documentUploadLockUntil: 1 } },
          { session }
        );
        if (!commit.matchedCount) throw new AppError(409, "The upload reservation expired. Please retry.");
        await logEvent(req, "request_document_uploaded", {
          userId: req.user._id,
          entityType: "RequestFile",
          entityId: file._id,
          context: { requestId: String(currentRequest._id), mimeType: body.type, size: data.length },
          detail: currentRequest.ref,
        }, session);
        return file;
      });
    } catch (error) {
      if (isAmbiguousCommit(error) || error?.transactionCommitted) {
        console.error("[requests] Document upload transaction outcome is ambiguous; retaining its file for safety.", {
          storageId,
          name: error.name || "Error",
          code: error.code || "unknown",
        });
      } else {
        await removeUncommittedFile(storagePath, storageId);
      }
      throw error;
    }
    return createdFile;
  });
  res.status(201).json({ file: { id: String(createdFile._id), name: originalName, type: createdFile.mimeType, size: createdFile.size } });
}
async function serve(req, res) {
  const request = await load(req);
  if (!/^[a-f\d]{24}$/i.test(req.params.fileId)) throw new AppError(404, "File not found.");
  const file = await RequestFile.findOne({ _id: req.params.fileId, requestId: request._id }).lean();
  if (!file || !/^[\da-f-]{36}$/i.test(file.storageId)) throw new AppError(404, "File not found.");
  const filename = file.originalName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encodedName = encodeURIComponent(file.originalName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set({ "Content-Type": file.mimeType, "Content-Length": String(file.size), "Content-Disposition": `${req.query.download === "1" || file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodedName}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin", "Accept-Ranges": "bytes" });
  res.sendFile(path.join(STORAGE, file.storageId), (err) => { if (err && !res.headersSent) res.status(404).json({ error: "File not found." }); });
}
module.exports = {
  list,
  authorizeUpload,
  upload,
  serve,
  authorizationFilter,
  isAmbiguousCommit,
  removeUncommittedFile,
};
