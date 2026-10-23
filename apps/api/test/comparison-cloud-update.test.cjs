const { test } = require("node:test");
const assert = require("node:assert/strict");
Object.assign(process.env, {
  NODE_ENV: "test",
  AUTH_MODE: "local",
  DATA_MODE: "file",
});
const { ComparisonService } = require("../dist/fit-comparison");
const { settings } = require("../dist/config");
const cloudModule = require("../dist/cloud");
test("cloud feedback and shortlist writes preserve set metadata and detect conflicting updates", async () => {
  const oldCloud = cloudModule.cloud,
    oldMode = settings.dataMode;
  let conflict = false,
    payload,
    filters = [];
  const current = {
    id: "check",
    ownerId: "owner",
    reference: { name: "Reference" },
    input: { product: { name: "Alternative" } },
    result: { version: 1 },
    feedback: { outcome: "Not tried yet", notes: "" },
    set: {
      id: "set",
      name: "Search",
      position: 0,
      commonMeasurements: ["chest"],
    },
    shortlisted: true,
    createdAt: "2026-10-22T10:00:00.000Z",
    updatedAt: "2026-10-22T10:00:00.000Z",
  };
  const query = {
    update(value) {
      payload = value;
      return this;
    },
    eq(key, value) {
      filters.push([key, value]);
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return {
        data: conflict
          ? null
          : {
              id: current.id,
              owner_id: current.ownerId,
              data: payload.data,
              created_at: current.createdAt,
              updated_at: payload.updated_at,
            },
        error: null,
      };
    },
  };
  try {
    settings.dataMode = "supabase";
    cloudModule.cloud = () => ({ from: () => query });
    const service = new ComparisonService({}, {});
    service.get = async () => structuredClone(current);
    const req = { identity: { id: "owner" }, accessToken: "test-only" };
    const changed = await service.feedback(req, "check", {
      outcome: "Works well",
      notes: "Comfortable",
    });
    assert.equal(changed.shortlisted, true);
    assert.deepEqual(changed.set, current.set);
    assert.equal(changed.feedback.outcome, "Works well");
    assert.deepEqual(filters, [
      ["id", "check"],
      ["owner_id", "owner"],
      ["updated_at", current.updatedAt],
    ]);
    filters = [];
    const toggled = await service.shortlist(req, "check", {
      shortlisted: false,
    });
    assert.equal(toggled.shortlisted, false);
    assert.deepEqual(toggled.set, current.set);
    conflict = true;
    await assert.rejects(
      service.shortlist(req, "check", { shortlisted: false }),
      (e) => e.getStatus() === 409,
    );
  } finally {
    cloudModule.cloud = oldCloud;
    settings.dataMode = oldMode;
  }
});
