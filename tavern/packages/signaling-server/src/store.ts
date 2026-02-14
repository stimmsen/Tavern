// TavernStore abstraction layer for persistence.
// Implementations: MemoryStore (default), SqliteStore (D2).

export interface TavernRecord {
  id: string;
  name: string;
  icon: string;
  creatorPublicKey: string;
  createdAt: string;
  signalingUrl: string;
}

export interface ChannelRecord {
  id: string;
  tavernId: string;
  name: string;
  createdAt: string;
}

export interface TavernStore {
  createTavern(tavern: TavernRecord): Promise<void>;
  getTavern(id: string): Promise<TavernRecord | null>;
  listTaverns(): Promise<TavernRecord[]>;
  updateTavern(id: string, patch: Partial<TavernRecord>): Promise<void>;
  deleteTavern(id: string): Promise<void>;
  createChannel(tavernId: string, channel: ChannelRecord): Promise<void>;
  getChannels(tavernId: string): Promise<ChannelRecord[]>;
  deleteChannel(tavernId: string, channelId: string): Promise<void>;
}
