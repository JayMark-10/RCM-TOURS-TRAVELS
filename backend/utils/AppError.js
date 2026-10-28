"use strict";
// An error that is safe to show to the user (short message, status code, optional per-field messages).
class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.expose = true;
    if (fields) this.fields = fields;
  }
}
module.exports = AppError;
