// SQLite-backed TavernStore implementation.
// Data survives server restarts. Uses better-sqlite3 (synchronous).
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS taverns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  creator_public_key TEXT NOT NULL,
  signaling_url TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  tavern_id TEXT NOT NULL REFERENCES taverns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
export class SqliteStore {
    db;
    constructor(dbPath) {
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.db.exec(SCHEMA_SQL);
    }
    async createTavern(tavern) {
        this.db
            .prepare(`INSERT INTO taverns (id, name, icon, creator_public_key, signaling_url, created_at)
         VALUES (@id, @name, @icon, @creatorPublicKey, @signalingUrl, @createdAt)`)
            .run(tavern);
    }
    async getTavern(id) {
        const row = this.db
            .prepare("SELECT id, name, icon, creator_public_key, signaling_url, created_at FROM taverns WHERE id = ?")
            .get(id);
        return row ? toTavernRecord(row) : null;
    }
    async listTaverns() {
        const rows = this.db
            .prepare("SELECT id, name, icon, creator_public_key, signaling_url, created_at FROM taverns ORDER BY created_at")
            .all();
        return rows.map(toTavernRecord);
    }
    async updateTavern(id, patch) {
        const fields = [];
        const values = { id };
        if (patch.name !== undefined) {
            fields.push("name = @name");
            values.name = patch.name;
        }
        if (patch.icon !== undefined) {
            fields.push("icon = @icon");
            values.icon = patch.icon;
        }
        if (patch.creatorPublicKey !== undefined) {
            fields.push("creator_public_key = @creatorPublicKey");
            values.creatorPublicKey = patch.creatorPublicKey;
        }
        if (patch.signalingUrl !== undefined) {
            fields.push("signaling_url = @signalingUrl");
            values.signalingUrl = patch.signalingUrl;
        }
        if (fields.length === 0) {
            return;
        }
        this.db
            .prepare(`UPDATE taverns SET ${fields.join(", ")} WHERE id = @id`)
            .run(values);
    }
    async deleteTavern(id) {
        this.db.prepare("DELETE FROM taverns WHERE id = ?").run(id);
    }
    async createChannel(tavernId, channel) {
        this.db
            .prepare(`INSERT INTO channels (id, tavern_id, name, created_at)
         VALUES (@id, @tavernId, @name, @createdAt)`)
            .run(channel);
    }
    async getChannels(tavernId) {
        const rows = this.db
            .prepare("SELECT id, tavern_id, name, created_at FROM channels WHERE tavern_id = ? ORDER BY created_at")
            .all(tavernId);
        return rows.map(toChannelRecord);
    }
    async deleteChannel(tavernId, channelId) {
        this.db.prepare("DELETE FROM channels WHERE id = ? AND tavern_id = ?").run(channelId, tavernId);
    }
}
const toTavernRecord = (row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    creatorPublicKey: row.creator_public_key,
    signalingUrl: row.signaling_url,
    createdAt: row.created_at
});
const toChannelRecord = (row) => ({
    id: row.id,
    tavernId: row.tavern_id,
    name: row.name,
    createdAt: row.created_at
});
