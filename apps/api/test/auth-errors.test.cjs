const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cloudAuthMessage } = require("../dist/auth-errors");
test("cloud sign-up failures explain the next action without exposing provider details", () => {
  assert.match(
    cloudAuthMessage("email_address_invalid", true),
    /real email address/,
  );
  assert.match(
    cloudAuthMessage("email_address_not_authorized", true),
    /configure an email provider/,
  );
  assert.match(
    cloudAuthMessage("email_not_confirmed", false),
    /Confirm your email/,
  );
  assert.match(
    cloudAuthMessage("over_email_send_rate_limit", true),
    /hourly limit resets/,
  );
  assert.equal(
    cloudAuthMessage("invalid_credentials", false),
    cloudAuthMessage("unknown", false),
  );
  assert.match(cloudAuthMessage(undefined, true), /Could not create account/);
});
