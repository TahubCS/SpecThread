// Registers faults with the test API proxy (scripts/test-api-proxy.mjs) for one user.
const proxy = "http://127.0.0.1:5107/__faults";

export type ApiFault = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Regular expression matched against the API path, such as "^/projects$". */
  path: string;
  status?: number;
  body?: unknown;
  close?: boolean;
  delayMs?: number;
  times?: number;
};

/** Makes matching API calls by this user fail, stall, or answer wrongly until `clearApiFaults`. */
export async function failApi(sub: string, fault: ApiFault) {
  const response = await fetch(proxy, { method: "POST", body: JSON.stringify({ sub, ...fault }) });
  if (response.status !== 204) throw new Error(`The test API proxy rejected the fault (${response.status}).`);
}

/** Removes every fault registered for this user. */
export async function clearApiFaults(sub: string) {
  await fetch(`${proxy}?sub=${encodeURIComponent(sub)}`, { method: "DELETE" });
}
