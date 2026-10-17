import { expect, test } from "@playwright/test";
import { canUnlink, enabledProviders, isUsableSignInMethod } from "../../app/web/src/lib/sign-in-methods";

const providers = { github: { enabled: false }, google: { enabled: true } };

test("only enabled providers and email/password count as usable sign-in methods", () => {
  expect(isUsableSignInMethod("credential", providers)).toBe(true);
  expect(isUsableSignInMethod("google", providers)).toBe(true);
  expect(isUsableSignInMethod("github", providers)).toBe(false);
  expect(isUsableSignInMethod("unknown", providers)).toBe(false);
});

test("an account can be unlinked only if another usable method remains", () => {
  const credential = { id: "c", usable: true };
  const github = { id: "g", usable: false };
  const google = { id: "o", usable: true };
  expect(canUnlink(credential, [credential, github])).toBe(false);
  expect(canUnlink(github, [credential, github])).toBe(true);
  expect(canUnlink(credential, [credential, github, google])).toBe(true);
  expect(canUnlink(credential, [credential])).toBe(false);
});

test("sign-in pages offer only the providers enabled in this deployment, in display order", () => {
  expect(enabledProviders(["github", "google"], providers)).toEqual(["google"]);
  expect(enabledProviders(["github", "google"], { github: { enabled: true }, google: { enabled: true } })).toEqual(["github", "google"]);
  expect(enabledProviders(["google", "github"], { github: { enabled: true }, google: { enabled: true } })).toEqual(["google", "github"]);
  expect(enabledProviders(["github", "google"], { github: { enabled: false }, google: { enabled: false } })).toEqual([]);
});
