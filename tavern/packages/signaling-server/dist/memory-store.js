// In-memory TavernStore implementation. Data is lost on server restart.
export class MemoryStore {
    taverns = new Map();
    channels = new Map();
    async createTavern(tavern) {
        this.taverns.set(tavern.id, { ...tavern });
    }
    async getTavern(id) {
        return this.taverns.get(id) ?? null;
    }
    async listTaverns() {
        return Array.from(this.taverns.values());
    }
    async updateTavern(id, patch) {
        const existing = this.taverns.get(id);
        if (!existing) {
            return;
        }
        this.taverns.set(id, { ...existing, ...patch });
    }
    async deleteTavern(id) {
        this.taverns.delete(id);
        this.channels.delete(id);
    }
    async createChannel(tavernId, channel) {
        const existing = this.channels.get(tavernId) ?? [];
        existing.push({ ...channel });
        this.channels.set(tavernId, existing);
    }
    async getChannels(tavernId) {
        return this.channels.get(tavernId) ?? [];
    }
    async deleteChannel(tavernId, channelId) {
        const existing = this.channels.get(tavernId);
        if (!existing) {
            return;
        }
        this.channels.set(tavernId, existing.filter((channel) => channel.id !== channelId));
    }
}
