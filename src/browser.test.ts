import { expect, test } from "bun:test";
import { BLOCKED_HOSTS, pacScript } from "./browser";

test("PAC script blocks Google services and nothing else", () => {
  const FindProxyForURL = new Function(`${pacScript()}; return FindProxyForURL;`)() as (url: string, host: string) => string;
  for (const h of ["mail.google.com", "drive.google.com", "myaccount.google.com", "passwords.google.com"]) expect(FindProxyForURL(`https://${h}/`, h)).toBe("PROXY 127.0.0.1:9");
  for (const h of ["accounts.google.com", "www.google.com", "launchfree.io"]) expect(FindProxyForURL(`https://${h}/`, h)).toBe("DIRECT");
  expect(BLOCKED_HOSTS).not.toContain("accounts.google.com");
});
