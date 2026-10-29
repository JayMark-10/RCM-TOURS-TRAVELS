export const FULL_NAME_ERROR =
  "Enter a valid full name using letters, spaces, hyphens, or apostrophes."

export const PHILIPPINE_MOBILE_ERROR =
  "Enter an 11-digit Philippine mobile number starting with 09 (for example, 09171234567)."

const FULL_NAME_PATTERN =
  /^\p{L}[\p{L}\p{M}]*(?:(?: +|[-'\u2019])\p{L}[\p{L}\p{M}]*)*$/u
const PHILIPPINE_MOBILE_PATTERN = /^09[0-9]{9}$/

export function isValidFullName(value) {
  if (typeof value !== "string") return false
  const name = value.trim()
  return name.length > 0 && name.length <= 120 && FULL_NAME_PATTERN.test(name)
}

export function isValidPhilippineMobile(value, { required = false } = {}) {
  if (typeof value !== "string") return false
  if (value === "") return !required
  return PHILIPPINE_MOBILE_PATTERN.test(value)
}
