import test from "node:test"
import assert from "node:assert/strict"

import {
  getHomeDestination,
  shouldScrollToTop,
} from "../src/lib/navigation.js"

test("Home destinations resolve to the public page or the signed-in role workspace", () => {
  assert.equal(getHomeDestination(), "/")
  assert.equal(getHomeDestination("customer"), "/portal")
  assert.equal(getHomeDestination("staff"), "/staff")
  assert.equal(getHomeDestination("admin"), "/admin")
})

test("Home navigation scrolls to the top when clearing a hash on the same route", () => {
  assert.equal(
    shouldScrollToTop({ hash: "", locationChanged: true, navigationType: "PUSH" }),
    true,
  )
  assert.equal(
    shouldScrollToTop({ hash: "#services", locationChanged: true, navigationType: "PUSH" }),
    false,
  )
  assert.equal(
    shouldScrollToTop({ hash: "", locationChanged: true, navigationType: "POP" }),
    false,
  )
})
