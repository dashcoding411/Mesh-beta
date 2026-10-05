-- Mesh push: devices that asked for notifications, and reminders waiting
-- to go out. Apply with:
--   npx wrangler@4 d1 execute mesh-push --remote --file cloudflare/push/schema.sql --config cloudflare/push/wrangler.toml

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,              -- SHA-256 of the push endpoint
  uid TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  kinds TEXT NOT NULL,              -- JSON list of the kinds this device wants
  quiet_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_uid ON devices (uid);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,              -- kind:ref:uid
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_at ON alerts (at);
CREATE INDEX IF NOT EXISTS alerts_ref ON alerts (kind, ref);

-- Each message, notice or call is pushed once, however often it's asked for.
CREATE TABLE IF NOT EXISTS sent (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
