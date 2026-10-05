// Storage on Cloudflare D1 (cloudflare/push/schema.sql). The Worker only
// uses this interface, so tests can swap in memory.

export const MAX_DEVICES = 10;

export function d1Store(db) {
  return {
    async device(id) {
      return db.prepare("SELECT * FROM devices WHERE id = ?1").bind(id).first();
    },
    async devicesFor(uid) {
      return (await db.prepare("SELECT * FROM devices WHERE uid = ?1").bind(uid).all()).results || [];
    },
    async upsertDevice(d, now) {
      await db.prepare(`INSERT INTO devices (id, uid, endpoint, p256dh, auth, kinds, quiet_until, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ON CONFLICT(id) DO UPDATE SET uid = ?2, p256dh = ?4, auth = ?5, kinds = ?6, quiet_until = ?7, updated_at = ?8`)
        .bind(d.id, d.uid, d.endpoint, d.p256dh, d.auth, d.kinds, d.quiet_until || 0, now).run();
      // Keep each account to its most recent devices.
      await db.prepare(`DELETE FROM devices WHERE uid = ?1 AND id NOT IN
        (SELECT id FROM devices WHERE uid = ?1 ORDER BY updated_at DESC LIMIT ?2)`).bind(d.uid, MAX_DEVICES).run();
    },
    async updateDevice(id, { kinds, quiet_until }, now) {
      await db.prepare(`UPDATE devices SET kinds = COALESCE(?2, kinds), quiet_until = COALESCE(?3, quiet_until), updated_at = ?4 WHERE id = ?1`)
        .bind(id, kinds ?? null, quiet_until ?? null, now).run();
    },
    async deleteDevice(id) {
      await db.prepare("DELETE FROM devices WHERE id = ?1").bind(id).run();
    },
    async deleteUser(uid) {
      await db.batch([
        db.prepare("DELETE FROM devices WHERE uid = ?1").bind(uid),
        db.prepare("DELETE FROM alerts WHERE uid = ?1").bind(uid),
      ]);
    },
    async putAlert(a) {
      await db.prepare(`INSERT INTO alerts (id, uid, kind, ref, at, title, body, url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET at = ?5, title = ?6, body = ?7, url = ?8`)
        .bind(a.id, a.uid, a.kind, a.ref, a.at, a.title, a.body, a.url).run();
    },
    async deleteAlert(id) {
      await db.prepare("DELETE FROM alerts WHERE id = ?1").bind(id).run();
    },
    async alertsFor(kind, ref) {
      return (await db.prepare("SELECT * FROM alerts WHERE kind = ?1 AND ref = ?2").bind(kind, ref).all()).results || [];
    },
    async dueAlerts(now, limit = 200) {
      return (await db.prepare("SELECT * FROM alerts WHERE at <= ?1 ORDER BY at LIMIT ?2").bind(now, limit).all()).results || [];
    },
    /** True the first time a key is seen, so each event is pushed once. */
    async markSent(key, now) {
      const r = await db.prepare("INSERT OR IGNORE INTO sent (key, at) VALUES (?1, ?2)").bind(key, now).run();
      return (r.meta?.changes || 0) > 0;
    },
    async pruneSent(before) {
      await db.prepare("DELETE FROM sent WHERE at < ?1").bind(before).run();
    },
  };
}
