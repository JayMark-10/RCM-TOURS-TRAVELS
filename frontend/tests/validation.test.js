import test from "node:test"
import assert from "node:assert/strict"

import {
  isValidFullName,
  isValidPhilippineMobile,
} from "../src/lib/validation.js"

test("full-name validation accepts Unicode names and allowed punctuation", () => {
  for (const name of [
    "Juan Dela Cruz",
    "Mary-Jane O'Connor",
    "Jos\u00e9 Dela Pe\u00f1a",
    "D\u2019Arcy Santos",
    "  Jose\u0301 Dela Pena  ",
  ]) {
    assert.equal(isValidFullName(name), true, name)
  }
})

test("full-name validation rejects empty values, digits, emoji, and symbols", () => {
  for (const name of ["", "   ", "Juan123", "Juan\u{1F600}", "12345", "Juan_Valid", "<b>Juan</b>"]) {
    assert.equal(isValidFullName(name), false, name)
  }
})

test("Philippine mobile validation accepts only the exact local format", () => {
  assert.equal(isValidPhilippineMobile("09171234567", { required: true }), true)
  for (const phone of ["0917123456", "091712345678", "0917ABC4567", "+639171234567", "0917 123 4567", "0917-123-4567"]) {
    assert.equal(isValidPhilippineMobile(phone, { required: true }), false, phone)
  }
  assert.equal(isValidPhilippineMobile("", { required: false }), true)
  assert.equal(isValidPhilippineMobile("", { required: true }), false)
})
