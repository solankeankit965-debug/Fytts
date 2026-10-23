const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const request = require("supertest");
test("accounts, private CRUD, upload validation, profiles and restart persistence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fytts-test-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_MODE: "local",
    DATA_MODE: "file",
    DATA_DIRECTORY: dir,
  });
  const { createApp } = require("../dist/app");
  let app = await createApp();
  try {
    const agent = request.agent(app.getHttpServer());
    const other = request.agent(app.getHttpServer());
    const origin = "http://127.0.0.1:3000";
    await agent.get("/api/garments").expect(401);
    await agent
      .post("/api/auth/signup")
      .send({ email: "owner@example.test", password: "fytts-testing-123" })
      .expect(403);
    await agent
      .post("/api/auth/signup")
      .set("Origin", origin)
      .send({ email: "owner@example.test", password: "fytts-testing-123" })
      .expect(201);
    await other
      .post("/api/auth/signup")
      .set("Origin", origin)
      .send({ email: "other@example.test", password: "fytts-testing-456" })
      .expect(201);
    await agent
      .patch("/api/profile")
      .set("Origin", origin)
      .send({ displayName: "Sid", preferredFit: "Relaxed" })
      .expect(200);
    const piece = {
      name: "Everyday Oxford",
      brand: "Uniqlo",
      category: "Shirt",
      labelSize: "M",
      fabric: "Cotton",
      silhouette: "Relaxed",
      stretch: "None",
      comfort: "Just right",
      color: "Blue",
      perfectFit: true,
      notes: "Great shoulders",
      measurements: { chest: 102, length: 72 },
    };
    await agent
      .post("/api/garments")
      .set("Origin", origin)
      .send({ ...piece, ownerId: "spoof" })
      .expect(400);
    await agent
      .post("/api/garments")
      .set("Origin", origin)
      .send({ ...piece, measurements: { chest: -1 } })
      .expect(400);
    const { body: g } = await agent
      .post("/api/garments")
      .set("Origin", origin)
      .send(piece)
      .expect(201);
    const checkInput = {
      referenceId: g.id,
      product: {
        name: "New Oxford",
        brand: "Other brand",
        category: "Shirt",
        labelSize: "M",
        fabric: "Cotton",
        stretch: "None",
        measurements: { chest: 104, length: 71 },
      },
      measurementMethod: "Circumference",
      sameMethodConfirmed: true,
    };
    await request(app.getHttpServer()).get("/api/comparisons").expect(401);
    await agent
      .post("/api/comparisons")
      .set("Origin", origin)
      .send({ ...checkInput, sameMethodConfirmed: false })
      .expect(400);
    await agent
      .post("/api/comparisons")
      .set("Origin", origin)
      .send({
        ...checkInput,
        product: { ...checkInput.product, category: "Jeans" },
      })
      .expect(400);
    await other
      .post("/api/comparisons")
      .set("Origin", origin)
      .send(checkInput)
      .expect(404);
    const { body: comparison } = await agent
      .post("/api/comparisons")
      .set("Origin", origin)
      .send(checkInput)
      .expect(201);
    assert.deepEqual(
      comparison.result.rows.map((r) => r.delta),
      [2, null, -1],
    );
    assert.deepEqual((await other.get("/api/comparisons")).body, []);
    await other.get("/api/comparisons/" + comparison.id).expect(404);
    await other
      .patch("/api/comparisons/" + comparison.id + "/feedback")
      .set("Origin", origin)
      .send({ outcome: "Works well", notes: "" })
      .expect(404);
    await agent
      .patch("/api/comparisons/" + comparison.id + "/feedback")
      .set("Origin", origin)
      .send({ outcome: "Made up", notes: "" })
      .expect(400);
    await agent
      .patch("/api/comparisons/" + comparison.id + "/feedback")
      .set("Origin", origin)
      .send({ outcome: "Works well", notes: "Great shoulders." })
      .expect(200);
    assert.equal((await agent.get("/api/garments")).body.length, 1);
    assert.deepEqual((await other.get("/api/garments")).body, []);
    await other.get("/api/garments/" + g.id).expect(404);
    await other
      .patch("/api/garments/" + g.id)
      .set("Origin", origin)
      .send(piece)
      .expect(404);
    await other
      .delete("/api/garments/" + g.id)
      .set("Origin", origin)
      .expect(404);
    await agent
      .post("/api/garments/" + g.id + "/image")
      .set("Origin", origin)
      .attach("image", Buffer.from("<svg></svg>"), {
        filename: "bad.png",
        contentType: "image/png",
      })
      .expect(400);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=",
      "base64",
    );
    await agent
      .post("/api/garments/" + g.id + "/image")
      .set("Origin", origin)
      .attach("image", png, { filename: "piece.png", contentType: "image/png" })
      .expect(201);
    await other.get("/api/garments/" + g.id + "/image").expect(404);
    const image = await agent
      .get("/api/garments/" + g.id + "/image")
      .expect(200);
    assert.match(image.headers["cache-control"], /private/);
    assert.equal(image.headers["content-type"], "image/png");
    await agent
      .patch("/api/garments/" + g.id)
      .set("Origin", origin)
      .send({ ...piece, name: "Updated Oxford" })
      .expect(200);
    await app.close();
    app = await createApp();
    const restarted = request.agent(app.getHttpServer());
    await restarted
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "owner@example.test", password: "fytts-testing-123" })
      .expect(201);
    assert.equal(
      (await restarted.get("/api/garments")).body[0].name,
      "Updated Oxford",
    );
    assert.equal(
      (await restarted.get("/api/session")).body.profile.displayName,
      "Sid",
    );
    await restarted
      .delete("/api/garments/" + g.id)
      .set("Origin", origin)
      .expect(200);
    assert.deepEqual((await restarted.get("/api/garments")).body, []);
    const saved = (await restarted.get("/api/comparisons")).body;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].reference.name, "Everyday Oxford");
    assert.equal(saved[0].feedback.outcome, "Works well");
    assert.equal(saved[0].feedback.notes, "Great shoulders.");

    await restarted.post("/api/auth/logout").set("Origin", origin).expect(201);
    await restarted.get("/api/garments").expect(401);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
