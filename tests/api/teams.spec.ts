import { expect, test } from "@playwright/test";

test("OpenAPI describes Teams and anonymous requests require authentication without database access", async ({ request }) => {
  const { paths } = await (await request.get("/openapi/v1.json")).json();
  expect(paths["/teams"].post.responses).toEqual(expect.objectContaining({ "201": expect.anything(), "400": expect.anything(), "401": expect.anything(), "403": expect.anything() }));
  expect(paths["/teams/{teamId}"].get.responses["404"]).toBeDefined();
  expect(paths["/teams/{teamId}"].patch.responses["403"]).toBeDefined();
  expect(paths["/teams/{teamId}/members/{userId}"].delete.responses["409"]).toBeDefined();
  expect(paths["/teams/{teamId}/ownership"].post.responses["403"]).toBeDefined();
  expect(paths["/teams/{teamId}/invitations"].post.responses["409"]).toBeDefined();
  expect(paths["/invites/{token}"].get.responses["200"]).toBeDefined();
  expect(paths["/invites/{token}/accept"].post.responses["410"]).toBeDefined();
  for (const response of [await request.get("/teams"), await request.post("/teams", { data: { name: "Private" } }),
    await request.get("/teams/00000000-0000-0000-0000-000000000000"),
    await request.delete("/teams/00000000-0000-0000-0000-000000000000/members/owner"),
    await request.post("/teams/00000000-0000-0000-0000-000000000000/ownership", { data: { userId: "member" } }),
    await request.get("/teams/00000000-0000-0000-0000-000000000000/invitations"),
    await request.post(`/invites/${"a".repeat(64)}/accept`)]) expect(response.status()).toBe(401);
});
