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

export type PeerSignalType = "offer" | "answer" | "ice-candidate";

export type ClientJoinMessage = {
  type: "join";
  room: string;
  identity?: PeerIdentity;
};

export type ClientCreateTavernMessage = {
  type: "create-tavern";
  name: string;
  icon?: string;
};

export type ClientJoinChannelMessage = {
  type: "join-channel";
  tavernId: string;
  channelId: string;
  identity: Pick<PeerIdentity, "publicKeyHex" | "displayName" | "tag">;
};

export type ClientLeaveChannelMessage = {
  type: "leave-channel";
  tavernId: string;
  channelId: string;
};

export type ClientGetTavernInfoMessage = {
  type: "get-tavern-info";
  tavernId: string;
};

export type ClientCreateChannelMessage = {
  type: "create-channel";
  tavernId: string;
  name: string;
};

export type ClientUpdateIdentityMessage = {
  type: "update-identity";
  identity: PeerIdentity;
};

export type ClientOfferMessage = {
  type: "offer";
  sdp: string;
  target?: string;
  tavernId?: string;
  channelId?: string;
};

export type ClientAnswerMessage = {
  type: "answer";
  sdp: string;
  target: string;
  tavernId?: string;
  channelId?: string;
};

export type ClientIceCandidateMessage = {
  type: "ice-candidate";
  candidate: string;
  target: string;
  tavernId?: string;
  channelId?: string;
};

export type ClientMessage =
  | ClientJoinMessage
  | ClientCreateTavernMessage
  | ClientJoinChannelMessage
  | ClientLeaveChannelMessage
  | ClientGetTavernInfoMessage
  | ClientCreateChannelMessage
  | ClientUpdateIdentityMessage
  | ClientOfferMessage
  | ClientAnswerMessage
  | ClientIceCandidateMessage;

export type ServerPeerJoinedMessage = {
  type: "peer-joined";
  peerId: string;
  identity?: PeerIdentity;
};

export type ServerPeerLeftMessage = {
  type: "peer-left";
  peerId: string;
  identity?: PeerIdentity;
};

export type ServerPeerListMessage = {
  type: "peer-list";
  peers: Array<{
    peerId: string;
    identity?: PeerIdentity;
  }>;
};

export type ServerPeerIdentityUpdatedMessage = {
  type: "peer-identity-updated";
  peerId: string;
  identity: PeerIdentity;
};

export type ServerTavernCreatedMessage = {
  type: "tavern-created";
  tavern: Tavern;
};

export type ServerChannelJoinedMessage = {
  type: "channel-joined";
  tavernId: string;
  channelId: string;
  peers: PeerInfo[];
};

export type ServerPeerJoinedChannelMessage = {
  type: "peer-joined-channel";
  tavernId: string;
  channelId: string;
  peer: PeerInfo;
};

export type ServerPeerLeftChannelMessage = {
  type: "peer-left-channel";
  tavernId: string;
  channelId: string;
  publicKeyHex: string;
};

export type ServerTavernInfoMessage = {
  type: "tavern-info";
  tavern: Tavern;
};

export type ServerChannelCreatedMessage = {
  type: "channel-created";
  tavernId: string;
  channel: Channel;
};

export type ServerRelayMessage = {
  type: PeerSignalType;
  from: string;
  identity?: PeerIdentity;
  tavernId?: string;
  channelId?: string;
  sdp?: string;
  candidate?: string;
};

export type ServerErrorMessage = {
  type: "error";
  message: string;
};

type UnknownRecord = Record<string, unknown>;

const isObject = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null;
};

const hasNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isOptionalString = (value: unknown): value is string | undefined => {
  return typeof value === "undefined" || typeof value === "string";
};

const isIdentity = (value: unknown): value is PeerIdentity => {
  if (!isObject(value)) {
    return false;
  }

  return (
    hasNonEmptyString(value.publicKeyHex) &&
    hasNonEmptyString(value.tag) &&
    (typeof value.displayName === "string" || value.displayName === null)
  );
};

const isJoinChannelIdentity = (
  value: unknown
): value is Pick<PeerIdentity, "publicKeyHex" | "displayName" | "tag"> => {
  return isIdentity(value);
};

export const isJoinMessage = (value: unknown): value is ClientJoinMessage => {
  if (!isObject(value) || value.type !== "join") {
    return false;
  }

  if (!hasNonEmptyString(value.room)) {
    return false;
  }

  if (typeof value.identity === "undefined") {
    return true;
  }

  return isIdentity(value.identity);
};

export const isCreateTavernMessage = (value: unknown): value is ClientCreateTavernMessage => {
  if (!isObject(value) || value.type !== "create-tavern") {
    return false;
  }

  return hasNonEmptyString(value.name) && isOptionalString(value.icon);
};

export const isJoinChannelMessage = (value: unknown): value is ClientJoinChannelMessage => {
  if (!isObject(value) || value.type !== "join-channel") {
    return false;
  }

  return (
    hasNonEmptyString(value.tavernId) &&
    hasNonEmptyString(value.channelId) &&
    isJoinChannelIdentity(value.identity)
  );
};

export const isLeaveChannelMessage = (value: unknown): value is ClientLeaveChannelMessage => {
  if (!isObject(value) || value.type !== "leave-channel") {
    return false;
  }

  return hasNonEmptyString(value.tavernId) && hasNonEmptyString(value.channelId);
};

export const isGetTavernInfoMessage = (value: unknown): value is ClientGetTavernInfoMessage => {
  if (!isObject(value) || value.type !== "get-tavern-info") {
    return false;
  }

  return hasNonEmptyString(value.tavernId);
};

export const isCreateChannelMessage = (value: unknown): value is ClientCreateChannelMessage => {
  if (!isObject(value) || value.type !== "create-channel") {
    return false;
  }

  return hasNonEmptyString(value.tavernId) && hasNonEmptyString(value.name);
};

export const isUpdateIdentityMessage = (value: unknown): value is ClientUpdateIdentityMessage => {
  if (!isObject(value) || value.type !== "update-identity") {
    return false;
  }

  return isIdentity(value.identity);
};

export const isOfferMessage = (value: unknown): value is ClientOfferMessage => {
  if (!isObject(value) || value.type !== "offer") {
    return false;
  }

  if (!hasNonEmptyString(value.sdp)) {
    return false;
  }

  if (typeof value.target !== "undefined" && !hasNonEmptyString(value.target)) {
    return false;
  }

  if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
    return false;
  }

  if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
    return false;
  }

  return true;
};

export const isAnswerMessage = (value: unknown): value is ClientAnswerMessage => {
  if (!isObject(value) || value.type !== "answer") {
    return false;
  }

  if (!hasNonEmptyString(value.sdp) || !hasNonEmptyString(value.target)) {
    return false;
  }

  if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
    return false;
  }

  if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
    return false;
  }

  return true;
};

export const isIceCandidateMessage = (value: unknown): value is ClientIceCandidateMessage => {
  if (!isObject(value) || value.type !== "ice-candidate") {
    return false;
  }

  if (!hasNonEmptyString(value.candidate) || !hasNonEmptyString(value.target)) {
    return false;
  }

  if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
    return false;
  }

  if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
    return false;
  }

  return true;
};

export const parseClientMessage = (raw: string): ClientMessage | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (isJoinMessage(parsed)) {
    return parsed;
  }

  if (isCreateTavernMessage(parsed)) {
    return parsed;
  }

  if (isJoinChannelMessage(parsed)) {
    return parsed;
  }

  if (isLeaveChannelMessage(parsed)) {
    return parsed;
  }

  if (isGetTavernInfoMessage(parsed)) {
    return parsed;
  }

  if (isCreateChannelMessage(parsed)) {
    return parsed;
  }

  if (isOfferMessage(parsed)) {
    return parsed;
  }

  if (isUpdateIdentityMessage(parsed)) {
    return parsed;
  }

  if (isAnswerMessage(parsed)) {
    return parsed;
  }

  if (isIceCandidateMessage(parsed)) {
    return parsed;
  }

  return null;
};
