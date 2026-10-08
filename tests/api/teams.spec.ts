import { expect, test } from "@playwright/test";

test("OpenAPI describes Teams and anonymous requests require authentication without database access", async ({ request }) => {
  const { paths } = await (await request.get("/openapi/v1.json")).json();
  expect(paths["/teams"].post.responses).toEqual(expect.objectContaining({ "201": expect.anything(), "400": expect.anything(), "401": expect.anything(), "403": expect.anything() }));
  expect(paths["/teams/{teamId}"].get.responses["404"]).toBeDefined();
  for (const response of [await request.get("/teams"), await request.post("/teams", { data: { name: "Private" } }),
    await request.get("/teams/00000000-0000-0000-0000-000000000000")]) expect(response.status()).toBe(401);
});
