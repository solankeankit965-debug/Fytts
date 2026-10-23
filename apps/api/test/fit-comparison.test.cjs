const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { compareMeasurements } = require("../dist/fit-comparison");
const { comparisonSchema } = require("@fytts/contracts");
const reference = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "owner",
  name: "Oxford",
  brand: "A",
  category: "Shirt",
  labelSize: "M",
  fabric: "Cotton",
  stretch: "None",
  measurements: { chest: 100, waist: 90, length: 70 },
};
const input = {
  referenceId: reference.id,
  product: {
    name: "New Oxford",
    brand: "B",
    category: "Shirt",
    labelSize: "L",
    fabric: "Linen",
    stretch: "A little",
    measurements: { chest: 102.1, waist: 89.9, length: 70 },
  },
  measurementMethod: "Circumference",
  sameMethodConfirmed: true,
};
test("measurement differences retain direction, tenths and missing-data coverage", () => {
  const result = compareMeasurements(reference, input);
  assert.deepEqual(
    result.rows.map((r) => r.delta),
    [2.1, -0.1, 0],
  );
  assert.equal(result.comparedCount, 3);
  assert.equal(result.stretchChanged, true);
  assert.equal(result.fabricChanged, true);
  assert.equal("score" in result, false);
  const sparse = compareMeasurements(reference, {
    ...input,
    product: { ...input.product, measurements: { length: 69 } },
  });
  assert.deepEqual(
    sparse.rows.map((r) => r.delta),
    [null, null, -1],
  );
  assert.equal(sparse.comparedCount, 1);
});
test("unrelated categories, absent overlap, invalid values and unconfirmed measurement methods are rejected", () => {
  assert.throws(
    () =>
      compareMeasurements(reference, {
        ...input,
        product: { ...input.product, category: "Jeans" },
      }),
    /same garment category/,
  );
  assert.throws(
    () =>
      compareMeasurements(reference, {
        ...input,
        product: { ...input.product, measurements: { hip: 100 } },
      }),
    /matching measurement/,
  );
  assert.equal(
    comparisonSchema.safeParse({ ...input, sameMethodConfirmed: false })
      .success,
    false,
  );
  assert.equal(
    comparisonSchema.safeParse({
      ...input,
      product: { ...input.product, measurements: { chest: 0 } },
    }).success,
    false,
  );
  assert.equal(
    comparisonSchema.safeParse({
      ...input,
      product: { ...input.product, measurements: { chest: 401 } },
    }).success,
    false,
  );
  assert.equal(
    comparisonSchema.safeParse({ ...input, ownerId: "spoof" }).success,
    false,
  );
  const trousers = compareMeasurements(
    {
      ...reference,
      category: "Jeans",
      measurements: { chest: 100, waist: 80, hip: 96, length: 100 },
    },
    {
      ...input,
      product: {
        ...input.product,
        category: "Jeans",
        measurements: { chest: 110, waist: 82, hip: 94, length: 101 },
      },
    },
  );
  assert.deepEqual(
    trousers.rows.map((r) => r.key),
    ["waist", "hip", "length"],
  );
});
test("existing local wardrobe files acquire an empty comparison collection without data loss", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fytts-legacy-"));
  try {
    const legacy = { accounts: [], profiles: [], garments: [reference] };
    await writeFile(join(dir, "development.json"), JSON.stringify(legacy));
    const { LocalStore } = require("../dist/local-store");
    const store = new LocalStore(dir);
    assert.deepEqual(await store.read((d) => d.comparisons), []);
    assert.equal((await store.read((d) => d.garments))[0].name, "Oxford");
    await store.write((d) => d.comparisons.push({ id: "check" }));
    assert.equal((await store.read((d) => d.comparisons))[0].id, "check");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
