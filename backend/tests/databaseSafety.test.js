"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeTestDatabase } = require("./databaseSafety");

test("destructive DB test guard accepts only the exact local disposable database", () => {
  assert.equal(isSafeTestDatabase("mongodb://127.0.0.1:27017/rcm_test", "1"), true);
  assert.equal(isSafeTestDatabase("mongodb://localhost:27017/rcm_test?authSource=admin", "1"), true);
  assert.equal(isSafeTestDatabase("mongodb://[::1]:27017/rcm_test", "1"), true);
});

test("destructive DB test guard rejects lookalike database names and nonlocal servers", () => {
  for (const uri of [
    "mongodb://localhost:27017/prod_test",
    "mongodb://localhost:27017/rcm_test_prod",
    "mongodb://localhost:27017/myrcm_test",
    "mongodb://db.example.com:27017/rcm_test",
    "mongodb://localhost:27017/rcm_test/other",
    "not a mongodb uri",
    "",
    undefined,
  ]) assert.equal(isSafeTestDatabase(uri, "1"), false, String(uri));
  assert.equal(isSafeTestDatabase("mongodb://localhost:27017/rcm_test", undefined), false);
  assert.equal(isSafeTestDatabase("mongodb://localhost:27017/rcm_test", "true"), false);
});
