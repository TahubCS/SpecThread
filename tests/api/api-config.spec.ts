import { expect, test } from "@playwright/test";
import { apiBaseUrl } from "../../app/web/src/lib/api-config";

test("the web app accepts only an API origin over HTTPS, or HTTP on loopback", () => {
  expect(apiBaseUrl("https://api.specthread.example").href).toBe("https://api.specthread.example/");
  expect(apiBaseUrl(" http://127.0.0.1:5000/ ").href).toBe("http://127.0.0.1:5000/");
  expect(apiBaseUrl("http://localhost:5000").href).toBe("http://localhost:5000/");
  for (const value of [
    undefined, "", "not a url", "http://api.specthread.example", "https://api.specthread.example/v1",
    "https://api.specthread.example/?x=1", "https://user:pass@api.specthread.example", "ftp://127.0.0.1",
  ]) expect(() => apiBaseUrl(value)).toThrow("Configure SPECTHREAD_API_URL");
});
