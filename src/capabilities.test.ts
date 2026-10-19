import { expect, test } from "bun:test";
import { Capabilities } from "./capabilities";

test("capabilities default to no email tool and agent-browser", () => {
  const c = Capabilities.parse({});
  expect(c.email.available).toBe(false);
  expect(c.browser.tool).toBe("agent-browser");
});
