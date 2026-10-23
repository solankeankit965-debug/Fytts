const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const request = require("supertest");
const fixture = {
  search_metadata: { status: "Success" },
  shopping_results: [
    {
      title: "Cotton Oxford Shirt",
      product_id: "123",
      product_link: "https://www.google.com/shopping/product/123",
      source: "H&M",
      price: "₹1,499.00",
      thumbnail: "https://encrypted-tbn0.gstatic.com/shopping/example",
      delivery: "Free delivery",
    },
    {
      title: "Duplicate",
      product_link: "https://www.google.com/shopping/product/123",
      source: "Other",
    },
    { title: "Unsafe", product_link: "javascript:alert(1)", price: "₹20" },
    {
      title: "Sold out shirt",
      link: "https://example.com/shirt",
      source: "Retailer",
      tag: "Out of stock",
      thumbnail: "https://localhost/image",
    },
  ],
};
test("catalogue is private, reports missing setup honestly, validates queries and never exposes its key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fytts-catalogue-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_MODE: "local",
    DATA_MODE: "file",
    DATA_DIRECTORY: dir,
  });
  delete process.env.SERPAPI_API_KEY;
  const { createApp } = require("../dist/app");
  const app = await createApp();
  const originalFetch = global.fetch;
  try {
    const http = app.getHttpServer();
    await request(http).get("/api/catalogue/status").expect(401);
    await request(http)
      .get("/api/catalogue/search?brand=Zara&category=Shirt&q=cotton")
      .expect(401);
    const agent = request.agent(http);
    await agent
      .post("/api/auth/signup")
      .set("Origin", "http://127.0.0.1:3000")
      .send({
        email: "catalogue@example.test",
        password: "Catalogue-test-only-2026",
      })
      .expect(201);
    const status = await agent.get("/api/catalogue/status").expect(200);
    assert.equal(status.body.configured, false);
    assert.equal(status.body.brands.length, 9);
    await agent
      .get("/api/catalogue/search")
      .query({ brand: "Zara", category: "Shirt", q: "cotton" })
      .expect(503);
    process.env.SERPAPI_API_KEY = "private-fixture-key";
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      const u = new URL(url);
      assert.equal(u.origin, "https://serpapi.com");
      assert.equal(u.pathname, "/search.json");
      assert.equal(u.searchParams.get("api_key"), "private-fixture-key");
      assert.equal(u.searchParams.get("gl"), "in");
      assert.equal(u.searchParams.get("q"), "H&M Shirt cotton");
      return Response.json(fixture);
    };
    await agent
      .get("/api/catalogue/search")
      .query({ brand: "Other", category: "Shirt", q: "cotton" })
      .expect(400);
    await agent
      .get("/api/catalogue/search")
      .query({ brand: "H&M", category: "Shirt", q: "a".repeat(81) })
      .expect(400);
    await agent
      .get("/api/catalogue/search")
      .query({
        brand: "H&M",
        category: "Shirt",
        q: "cotton",
        url: "http://localhost",
      })
      .expect(400);
    assert.equal(calls, 0);
    const params = { brand: "H&M", category: "Shirt", q: "cotton" };
    const first = await agent
      .get("/api/catalogue/search")
      .query(params)
      .expect(200);
    assert.equal(first.body.products.length, 2);
    assert.equal(first.body.products[0].source.priceLabel, "₹1,499.00");
    assert.equal(first.body.products[0].availability, "Check with seller");
    assert.equal(first.body.products[1].availability, "Out of stock");
    assert.equal(first.body.products[1].image, null);
    assert.equal("measurements" in first.body.products[0], false);
    assert.equal("brand" in first.body.products[0], false); // Search terms do not verify the brand.
    const again = await agent
      .get("/api/catalogue/search")
      .query(params)
      .expect(200);
    assert.equal(again.body.cached, true);
    assert.equal(calls, 1);
    assert.equal(
      JSON.stringify(first.body).includes("private-fixture-key"),
      false,
    );
    const { comparisonSchema } = require("@fytts/contracts");
    const item = {
      referenceId: "00000000-0000-4000-8000-000000000001",
      measurementMethod: "Circumference",
      sameMethodConfirmed: true,
      product: {
        name: "Oxford shirt",
        brand: "H&M",
        category: "Shirt",
        labelSize: "M",
        fabric: "Cotton",
        stretch: "None",
        measurements: { chest: 100 },
        source: first.body.products[0].source,
      },
    };
    assert.equal(comparisonSchema.safeParse(item).success, true);
    assert.equal(
      comparisonSchema.safeParse({
        ...item,
        product: {
          ...item.product,
          source: { ...item.product.source, url: "javascript:alert(1)" },
        },
      }).success,
      false,
    );
  } finally {
    global.fetch = originalFetch;
    delete process.env.SERPAPI_API_KEY;
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("provider errors, rate limits, unsafe URLs, deduplication and empty searches stay explicit", async () => {
  const { CatalogueService, publicHttps } = require("../dist/catalogue");
  for (const url of [
    "http://example.com/a",
    "https://127.0.0.1/a",
    "https://user:password@example.com/a",
    "https://[::1]/",
    "https://example.test/",
    "https://serpapi.com/search?api_key=secret",
  ])
    assert.equal(publicHttps(url), null);
  assert.equal(publicHttps("https://example.com/a"), "https://example.com/a");
  const originalFetch = global.fetch;
  process.env.SERPAPI_API_KEY = "private-fixture-key";
  const query = { brand: "Zara", category: "Shirt", q: "cotton" };
  try {
    global.fetch = async () => {
      throw new Error("url contains private-fixture-key");
    };
    await assert.rejects(
      new CatalogueService().search("u", query),
      (e) =>
        e.getStatus() === 502 && !e.message.includes("private-fixture-key"),
    );
    global.fetch = async () =>
      Response.json({ error: "quota private-fixture-key" }, { status: 429 });
    const limited = new CatalogueService();
    await assert.rejects(
      limited.search("u", query),
      (e) => e.getStatus() === 429,
    );
    global.fetch = async () => {
      throw new Error("Should not retry during cooldown");
    };
    await assert.rejects(
      limited.search("u", query),
      (e) => e.getStatus() === 429,
    );
    global.fetch = async () =>
      Response.json({ shopping_results: [], search_information: {} });
    assert.deepEqual(
      (await new CatalogueService().search("u", query)).products,
      [],
    );
    global.fetch = async () => Response.json({ secret: "unexpected" });
    await assert.rejects(
      new CatalogueService().search("u", query),
      (e) => e.getStatus() === 502,
    );
    global.fetch = async () => Response.json(fixture);
    const cap = new CatalogueService();
    for (let i = 0; i < 30; i++)
      await cap.search("different-user-" + i, { ...query, q: "shirt " + i });
    await assert.rejects(
      cap.search("last-user", { ...query, q: "shirt limit" }),
      (e) => e.getStatus() === 429,
    );
  } finally {
    global.fetch = originalFetch;
    delete process.env.SERPAPI_API_KEY;
  }
});
