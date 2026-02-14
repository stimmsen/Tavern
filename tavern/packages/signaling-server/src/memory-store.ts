// In-memory TavernStore implementation. Data is lost on server restart.

import type { TavernStore, TavernRecord, ChannelRecord } from "./store.js";

export class MemoryStore implements TavernStore {
  private readonly taverns = new Map<string, TavernRecord>();
  private readonly channels = new Map<string, ChannelRecord[]>();

  public async createTavern(tavern: TavernRecord): Promise<void> {
    this.taverns.set(tavern.id, { ...tavern });
  }

  public async getTavern(id: string): Promise<TavernRecord | null> {
    return this.taverns.get(id) ?? null;
  }

  public async listTaverns(): Promise<TavernRecord[]> {
    return Array.from(this.taverns.values());
  }

  public async updateTavern(id: string, patch: Partial<TavernRecord>): Promise<void> {
    const existing = this.taverns.get(id);
    if (!existing) {
      return;
    }
    this.taverns.set(id, { ...existing, ...patch });
  }

  public async deleteTavern(id: string): Promise<void> {
    this.taverns.delete(id);
    this.channels.delete(id);
  }

  public async createChannel(tavernId: string, channel: ChannelRecord): Promise<void> {
    const existing = this.channels.get(tavernId) ?? [];
    existing.push({ ...channel });
    this.channels.set(tavernId, existing);
  }

  public async getChannels(tavernId: string): Promise<ChannelRecord[]> {
    return this.channels.get(tavernId) ?? [];
  }

  public async deleteChannel(tavernId: string, channelId: string): Promise<void> {
    const existing = this.channels.get(tavernId);
    if (!existing) {
      return;
    }
    this.channels.set(
      tavernId,
      existing.filter((channel) => channel.id !== channelId)
    );
  }
}
