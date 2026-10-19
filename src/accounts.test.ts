import { expect, test } from "bun:test";
import { accountFrom } from "./accounts";

test("accountFrom reads every checkpoint shape agents write", () => {
  expect(accountFrom({ account: { vault: "x-p", username: "a@b.c" } })).toEqual({ method: "password", username: "a@b.c", vault: "x-p" });
  expect(accountFrom({ account: { oauth: "google", scopes: ["email"] } })).toEqual({ method: "google", username: null, vault: null });
  expect(accountFrom({ account: { method: "magic_link", email: "a@b.c" } })).toEqual({ method: "magic_link", username: "a@b.c", vault: null });
  expect(accountFrom({ account: "x-p" })).toEqual({ method: "password", username: null, vault: "x-p" });
  expect(accountFrom({ step: "ready" })).toBeNull();
});
