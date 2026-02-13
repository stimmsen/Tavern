// Type definitions and runtime guards for signaling protocol messages.

export type PeerSignalType = "offer" | "answer" | "ice-candidate";

export type ClientJoinMessage = {
  type: "join";
  room: string;
};

export type ClientOfferMessage = {
  type: "offer";
  sdp: string;
  target?: string;
};

export type ClientAnswerMessage = {
  type: "answer";
  sdp: string;
  target: string;
};

export type ClientIceCandidateMessage = {
  type: "ice-candidate";
  candidate: string;
  target: string;
};

export type ClientMessage =
  | ClientJoinMessage
  | ClientOfferMessage
  | ClientAnswerMessage
  | ClientIceCandidateMessage;

export type ServerPeerJoinedMessage = {
  type: "peer-joined";
  peerId: string;
};

export type ServerPeerLeftMessage = {
  type: "peer-left";
  peerId: string;
};

export type ServerRelayMessage = {
  type: PeerSignalType;
  from: string;
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

export const isJoinMessage = (value: unknown): value is ClientJoinMessage => {
  if (!isObject(value) || value.type !== "join") {
    return false;
  }

  return hasNonEmptyString(value.room);
};

export const isOfferMessage = (value: unknown): value is ClientOfferMessage => {
  if (!isObject(value) || value.type !== "offer") {
    return false;
  }

  if (!hasNonEmptyString(value.sdp)) {
    return false;
  }

  if (typeof value.target === "undefined") {
    return true;
  }

  return hasNonEmptyString(value.target);
};

export const isAnswerMessage = (value: unknown): value is ClientAnswerMessage => {
  if (!isObject(value) || value.type !== "answer") {
    return false;
  }

  return hasNonEmptyString(value.sdp) && hasNonEmptyString(value.target);
};

export const isIceCandidateMessage = (value: unknown): value is ClientIceCandidateMessage => {
  if (!isObject(value) || value.type !== "ice-candidate") {
    return false;
  }

  return hasNonEmptyString(value.candidate) && hasNonEmptyString(value.target);
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

  if (isOfferMessage(parsed)) {
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
