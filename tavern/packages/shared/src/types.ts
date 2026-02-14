export interface PeerIdentity {
  publicKeyHex: string;
  tag: string;
  displayName: string | null;
}

export interface PeerInfo {
  publicKeyHex: string;
  displayName: string;
  tavernId: string;
  channelId: string;
  isSpeaking: boolean;
  tag?: string;
}

export interface Channel {
  id: string;
  name: string;
  peers: PeerInfo[];
}

export interface Tavern {
  id: string;
  name: string;
  icon?: string;
  channels: Channel[];
  createdBy: string;
  createdAt: string;
}

export interface SavedTavern {
  id: string;
  name: string;
  icon?: string;
  lastJoined: string;
  inviteCode: string;
}
