import { describe, it, expect } from "vitest";
import {
  isJoinMessage,
  isCreateTavernMessage,
  isJoinChannelMessage,
  isLeaveChannelMessage,
  isGetTavernInfoMessage,
  isCreateChannelMessage,
  isUpdateIdentityMessage,
  isOfferMessage,
  isAnswerMessage,
  isIceCandidateMessage,
  parseClientMessage
} from "../../src/types.js";

describe("message validators", () => {
  describe("isJoinMessage", () => {
    it("accepts valid join message", () => {
      expect(isJoinMessage({ type: "join", room: "room-1" })).toBe(true);
    });

    it("accepts join with identity", () => {
      expect(
        isJoinMessage({
          type: "join",
          room: "room-1",
          identity: { publicKeyHex: "abc", tag: "TVN-abcd-ef01", displayName: "Alice" }
        })
      ).toBe(true);
    });

    it("rejects missing room", () => {
      expect(isJoinMessage({ type: "join" })).toBe(false);
    });

    it("rejects empty room", () => {
      expect(isJoinMessage({ type: "join", room: "  " })).toBe(false);
    });
  });

  describe("isCreateTavernMessage", () => {
    it("accepts valid create-tavern", () => {
      expect(isCreateTavernMessage({ type: "create-tavern", name: "My Tavern" })).toBe(true);
    });

    it("accepts with optional icon", () => {
      expect(isCreateTavernMessage({ type: "create-tavern", name: "T", icon: "🍺" })).toBe(true);
    });

    it("rejects empty name", () => {
      expect(isCreateTavernMessage({ type: "create-tavern", name: "" })).toBe(false);
    });
  });

  describe("isJoinChannelMessage", () => {
    const valid = {
      type: "join-channel",
      tavernId: "t1",
      channelId: "c1",
      identity: { publicKeyHex: "abc", tag: "TVN-1234-5678", displayName: "Bob" }
    };

    it("accepts valid join-channel", () => {
      expect(isJoinChannelMessage(valid)).toBe(true);
    });

    it("rejects missing identity", () => {
      expect(isJoinChannelMessage({ type: "join-channel", tavernId: "t1", channelId: "c1" })).toBe(false);
    });
  });

  describe("isLeaveChannelMessage", () => {
    it("accepts valid leave-channel", () => {
      expect(isLeaveChannelMessage({ type: "leave-channel", tavernId: "t1", channelId: "c1" })).toBe(true);
    });

    it("rejects missing channelId", () => {
      expect(isLeaveChannelMessage({ type: "leave-channel", tavernId: "t1" })).toBe(false);
    });
  });

  describe("isGetTavernInfoMessage", () => {
    it("accepts valid get-tavern-info", () => {
      expect(isGetTavernInfoMessage({ type: "get-tavern-info", tavernId: "t1" })).toBe(true);
    });

    it("rejects missing tavernId", () => {
      expect(isGetTavernInfoMessage({ type: "get-tavern-info" })).toBe(false);
    });
  });

  describe("isCreateChannelMessage", () => {
    it("accepts valid create-channel", () => {
      expect(isCreateChannelMessage({ type: "create-channel", tavernId: "t1", name: "Voice" })).toBe(true);
    });

    it("rejects empty name", () => {
      expect(isCreateChannelMessage({ type: "create-channel", tavernId: "t1", name: "" })).toBe(false);
    });
  });

  describe("isUpdateIdentityMessage", () => {
    it("accepts valid update-identity", () => {
      expect(
        isUpdateIdentityMessage({
          type: "update-identity",
          identity: { publicKeyHex: "abc", tag: "TVN-1234-5678", displayName: null }
        })
      ).toBe(true);
    });

    it("rejects missing identity", () => {
      expect(isUpdateIdentityMessage({ type: "update-identity" })).toBe(false);
    });
  });

  describe("isOfferMessage", () => {
    it("accepts valid offer", () => {
      expect(isOfferMessage({ type: "offer", sdp: "v=0..." })).toBe(true);
    });

    it("rejects empty sdp", () => {
      expect(isOfferMessage({ type: "offer", sdp: "" })).toBe(false);
    });
  });

  describe("isAnswerMessage", () => {
    it("accepts valid answer", () => {
      expect(isAnswerMessage({ type: "answer", sdp: "v=0...", target: "peer1" })).toBe(true);
    });

    it("rejects missing target", () => {
      expect(isAnswerMessage({ type: "answer", sdp: "v=0..." })).toBe(false);
    });
  });

  describe("isIceCandidateMessage", () => {
    it("accepts valid ice-candidate", () => {
      expect(isIceCandidateMessage({ type: "ice-candidate", candidate: "a=...", target: "peer1" })).toBe(true);
    });

    it("rejects missing target", () => {
      expect(isIceCandidateMessage({ type: "ice-candidate", candidate: "a=..." })).toBe(false);
    });
  });
});

describe("parseClientMessage", () => {
  it("parses valid JSON messages", () => {
    const result = parseClientMessage('{"type":"join","room":"test"}');
    expect(result).not.toBeNull();
    expect(result!.type).toBe("join");
  });

  it("returns null for invalid JSON", () => {
    expect(parseClientMessage("not json")).toBeNull();
  });

  it("returns null for unknown message type", () => {
    expect(parseClientMessage('{"type":"unknown-type"}')).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(parseClientMessage("{}")).toBeNull();
  });
});
