import { expect, test } from "@playwright/test";

// Database-backed behavior is covered in tests/schema/product-api.spec.ts.
test("OpenAPI describes the product endpoints", async ({ request }) => {
  const { paths } = await (await request.get("/openapi/v1.json")).json();
  expect(Object.keys(paths)).toEqual(expect.arrayContaining([
    "/projects", "/projects/{projectId}", "/projects/{projectId}/archive", "/projects/{projectId}/restore", "/teams/{teamId}/projects",
    "/projects/{projectId}/requirements", "/requirements/{requirementId}", "/requirements/{requirementId}/archive",
    "/projects/{projectId}/members", "/projects/{projectId}/members/{userId}",
  ]));
  expect(paths["/requirements/{requirementId}"].put.responses).toEqual(
    expect.objectContaining({ "200": expect.anything(), "400": expect.anything(), "401": expect.anything(), "404": expect.anything(), "409": expect.anything() }));
  expect(paths["/projects/{projectId}"].patch.responses["403"]).toBeDefined();
  expect(paths["/projects/{projectId}/members"].post.responses["410"]).toBeDefined();
});

test("product endpoints reject anonymous requests before touching the database", async ({ request }) => {
  for (const response of [
    await request.get("/projects"),
    await request.post("/projects", { data: { name: "Anonymous" } }),
    await request.put("/requirements/00000000-0000-0000-0000-000000000000", { data: { title: "x", version: 1 } }),
  ]) expect(response.status()).toBe(401);
});
