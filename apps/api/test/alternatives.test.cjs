const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const request = require("supertest");
const { rankAlternatives } = require("@fytts/contracts");
const reference = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "owner",
  name: "Oxford",
  brand: "UNIQLO",
  category: "Shirt",
  labelSize: "M",
  fabric: "Cotton",
  silhouette: "Relaxed",
  stretch: "None",
  comfort: "Just right",
  color: "Blue",
  perfectFit: true,
  notes: "",
  measurements: { chest: 100, waist: 90, length: 70 },
};
function product(name, measurements) {
  return {
    name,
    brand: "H&M",
    category: "Shirt",
    labelSize: "M",
    fabric: "Cotton",
    stretch: "None",
    measurements,
  };
}
function record(id, p, position) {
  return {
    id,
    ownerId: "owner",
    reference,
    input: {
      referenceId: reference.id,
      product: p,
      measurementMethod: "Circumference",
      sameMethodConfirmed: true,
    },
    feedback: { outcome: "Not tried yet", notes: "" },
    set: { id: "set", name: "Search", position },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
test("alternatives rank on the same dimensions, preserve ties, and never invent a fit score", () => {
  const a = record(
      "a",
      product("Option A", { chest: 101, waist: 91, length: 70 }),
      0,
    ),
    b = record("b", product("Option B", { chest: 102, length: 70 }), 1),
    c = record("c", product("Option C", { chest: 99, length: 70 }), 2);
  const ranked = rankAlternatives([b, c, a]);
  assert.deepEqual(
    ranked.map((x) => x.comparison.id),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    ranked.map((x) => x.rank),
    [1, 1, 3],
  );
  assert.deepEqual(ranked[0].common, ["chest", "length"]);
  assert.equal(ranked[0].meanDifference, 0.5);
  assert.equal(ranked[2].meanDifference, 1);
  assert.equal("score" in ranked[0], false);
  assert.deepEqual(rankAlternatives([]), []);
  assert.deepEqual(
    rankAlternatives([
      record("x", product("One", { chest: 101 }), 0),
      record("y", product("Two", { length: 71 }), 1),
    ]),
    [],
  );
});
test("saved alternative sets are atomic, private, backward-compatible and persistent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fytts-alternatives-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_MODE: "local",
    DATA_MODE: "file",
    DATA_DIRECTORY: dir,
  });
  const { createApp } = require("../dist/app");
  let app = await createApp();
  try {
    const owner = request.agent(app.getHttpServer()),
      other = request.agent(app.getHttpServer()),
      origin = "http://127.0.0.1:3000";
    for (const [agent, email] of [
      [owner, "alternatives-owner@example.test"],
      [other, "alternatives-other@example.test"],
    ])
      await agent
        .post("/api/auth/signup")
        .set("Origin", origin)
        .send({ email, password: "Alternatives-testing-2026" })
        .expect(201);
    const { id, ownerId, ...body } = reference;
    const { body: g } = await owner
      .post("/api/garments")
      .set("Origin", origin)
      .send(body)
      .expect(201);
    const input = {
      name: "My everyday shirts",
      referenceId: g.id,
      products: [
        product("Close Oxford", { chest: 101, waist: 90, length: 70 }),
        product("Linen option", { chest: 104, waist: 92, length: 72 }),
      ],
      measurementMethod: "Circumference",
      sameMethodConfirmed: true,
    };
    await request(app.getHttpServer())
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send(input)
      .expect(401);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({ ...input, products: [input.products[0]] })
      .expect(400);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({ ...input, products: Array(6).fill(input.products[0]) })
      .expect(400);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({ ...input, sameMethodConfirmed: false })
      .expect(400);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({ ...input, ownerId: "spoof" })
      .expect(400);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({
        ...input,
        products: [
          input.products[0],
          { ...input.products[1], category: "Jeans" },
        ],
      })
      .expect(400);
    await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send({
        ...input,
        products: [
          product("Chest only", { chest: 101 }),
          product("Length only", { length: 71 }),
        ],
      })
      .expect(400);
    assert.deepEqual((await owner.get("/api/comparisons")).body, []);
    await other
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send(input)
      .expect(404);
    const { body: checks } = await owner
      .post("/api/comparisons/sets")
      .set("Origin", origin)
      .send(input)
      .expect(201);
    assert.equal(checks.length, 2);
    assert.equal(checks[0].set.id, checks[1].set.id);
    assert.deepEqual(
      checks.map((c) => c.set.position),
      [0, 1],
    );
    assert.deepEqual(checks[0].set.commonMeasurements, [
      "chest",
      "waist",
      "length",
    ]);
    assert.deepEqual((await other.get("/api/comparisons")).body, []);
    await other
      .patch("/api/comparisons/" + checks[0].id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: true })
      .expect(404);
    await owner
      .patch("/api/comparisons/" + checks[0].id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: "true" })
      .expect(400);
    await owner
      .patch("/api/comparisons/" + checks[0].id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: true })
      .expect(200);
    const { body: feedback } = await owner
      .patch("/api/comparisons/" + checks[0].id + "/feedback")
      .set("Origin", origin)
      .send({ outcome: "Works well", notes: "Good shoulders." })
      .expect(200);
    assert.equal(feedback.shortlisted, true);
    assert.equal(feedback.set.id, checks[0].set.id);
    const { body: removed } = await owner
      .patch("/api/comparisons/" + checks[0].id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: false })
      .expect(200);
    assert.equal(removed.feedback.outcome, "Works well");
    assert.equal(removed.set.name, input.name);
    await owner
      .patch("/api/comparisons/" + checks[0].id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: true })
      .expect(200);
    const { body: single } = await owner
      .post("/api/comparisons")
      .set("Origin", origin)
      .send({
        referenceId: g.id,
        product: input.products[0],
        measurementMethod: "Circumference",
        sameMethodConfirmed: true,
      })
      .expect(201);
    await owner
      .patch("/api/comparisons/" + single.id + "/shortlist")
      .set("Origin", origin)
      .send({ shortlisted: true })
      .expect(400);
    await owner
      .patch("/api/garments/" + g.id)
      .set("Origin", origin)
      .send({
        ...body,
        name: "Changed reference",
        measurements: { chest: 120 },
      })
      .expect(200);
    await owner
      .delete("/api/garments/" + g.id)
      .set("Origin", origin)
      .expect(200);
    await app.close();
    app = await createApp();
    const restarted = request.agent(app.getHttpServer());
    await restarted
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({
        email: "alternatives-owner@example.test",
        password: "Alternatives-testing-2026",
      })
      .expect(201);
    const saved = (await restarted.get("/api/comparisons")).body.filter(
      (c) => c.set,
    );
    assert.equal(saved.length, 2);
    const chosen = saved.find((c) => c.id === checks[0].id);
    assert.equal(chosen.shortlisted, true);
    assert.equal(chosen.feedback.notes, "Good shoulders.");
    assert.equal(chosen.reference.name, "Oxford");
    assert.equal(chosen.reference.measurements.chest, 100);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
