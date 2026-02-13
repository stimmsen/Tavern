// Browser client entry point wiring UI, signaling, Opus, RNNoise, VAD, and PTT.

import { iceServers } from "../../shared/src/ice-config.js";
import {
  deriveIdentityTag,
  exportKeypairToFile,
  formatIdentityDisplay,
  getDisplayName,
  getOrCreateKeypair,
  getPublicKeyHex,
  importKeypairFromFile,
  setDisplayName
} from "../../crypto/src/index.js";
import { createLocalAudioController, monitorRemoteAudio, type AudioMonitorStop } from "./audio.js";
import { NoiseSuppressor } from "./noise-suppression.js";
import { PeerManager } from "./peer-manager.js";
import { PushToTalk } from "./ptt.js";
import {
  onDisplayNameSubmit,
  onExportIdentity,
  onImportIdentity,
  onMuteToggle,
  onNoiseSuppressionToggle,
  onPttToggle,
  onVadToggle,
  removePeer,
  setDisplayNameInputValue,
  setLocalIdentityDisplay,
  setLocalSpeaking,
  setMuteLabel,
  setNoiseSuppressionEnabled,
  setNoiseSuppressionUnavailable,
  setPttEnabled,
  setPttState,
  setPeerLabel,
  setRoom,
  setStatus,
  setVadEnabled,
  setVadState,
  setVadUnavailable,
  upsertPeer
} from "./ui.js";
import { VoiceActivityDetector } from "./vad.js";

type PeerIdentity = {
  publicKeyHex: string;
  tag: string;
  displayName: string | null;
};

type PeerDescriptor = {
  peerId: string;
  identity?: PeerIdentity;
};

type IncomingMessage =
  | { type: "peer-list"; peers: PeerDescriptor[] }
  | { type: "peer-joined"; peerId: string; identity?: PeerIdentity }
  | { type: "peer-left"; peerId: string; identity?: PeerIdentity }
  | { type: "peer-identity-updated"; peerId: string; identity: PeerIdentity }
  | { type: "offer"; from: string; sdp: string; identity?: PeerIdentity }
  | { type: "answer"; from: string; sdp: string; identity?: PeerIdentity }
  | { type: "ice-candidate"; from: string; candidate: string; identity?: PeerIdentity }
  | { type: "error"; message: string };

const getRoomId = (): string => {
  const params = new URLSearchParams(window.location.search);
  return params.get("room")?.trim() || "abc123";
};

const getSignalingUrl = (): string => {
  const params = new URLSearchParams(window.location.search);
  const overrideUrl = params.get("ws")?.trim();

  if (overrideUrl) {
    return overrideUrl;
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${wsProtocol}://${window.location.hostname}:8080`;
};

const isPeerIdentity = (value: unknown): value is PeerIdentity => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.publicKeyHex === "string" &&
    typeof candidate.tag === "string" &&
    (typeof candidate.displayName === "string" || candidate.displayName === null)
  );
};

const readPeerIdentity = (value: unknown): PeerIdentity | undefined => {
  if (!isPeerIdentity(value)) {
    return undefined;
  }

  return value;
};

const readPeerDescriptor = (value: unknown): PeerDescriptor | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.peerId !== "string") {
    return null;
  }

  return {
    peerId: candidate.peerId,
    identity: readPeerIdentity(candidate.identity)
  };
};

const parseIncomingMessage = (raw: string): IncomingMessage | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.type === "peer-list" && Array.isArray(candidate.peers)) {
    const peers: PeerDescriptor[] = [];

    for (const peer of candidate.peers) {
      const descriptor = readPeerDescriptor(peer);

      if (!descriptor) {
        return null;
      }

      peers.push(descriptor);
    }

    return { type: "peer-list", peers };
  }

  if (candidate.type === "peer-joined" && typeof candidate.peerId === "string") {
    return {
      type: "peer-joined",
      peerId: candidate.peerId,
      identity: readPeerIdentity(candidate.identity)
    };
  }

  if (candidate.type === "peer-left" && typeof candidate.peerId === "string") {
    return {
      type: "peer-left",
      peerId: candidate.peerId,
      identity: readPeerIdentity(candidate.identity)
    };
  }

  if (
    candidate.type === "peer-identity-updated" &&
    typeof candidate.peerId === "string" &&
    isPeerIdentity(candidate.identity)
  ) {
    return {
      type: "peer-identity-updated",
      peerId: candidate.peerId,
      identity: candidate.identity
    };
  }

  if (
    candidate.type === "offer" &&
    typeof candidate.from === "string" &&
    typeof candidate.sdp === "string"
  ) {
    return {
      type: "offer",
      from: candidate.from,
      sdp: candidate.sdp,
      identity: readPeerIdentity(candidate.identity)
    };
  }

  if (
    candidate.type === "answer" &&
    typeof candidate.from === "string" &&
    typeof candidate.sdp === "string"
  ) {
    return {
      type: "answer",
      from: candidate.from,
      sdp: candidate.sdp,
      identity: readPeerIdentity(candidate.identity)
    };
  }

  if (
    candidate.type === "ice-candidate" &&
    typeof candidate.from === "string" &&
    typeof candidate.candidate === "string"
  ) {
    return {
      type: "ice-candidate",
      from: candidate.from,
      candidate: candidate.candidate,
      identity: readPeerIdentity(candidate.identity)
    };
  }

  if (candidate.type === "error" && typeof candidate.message === "string") {
    return { type: "error", message: candidate.message };
  }

  return null;
};

const formatPeerDisplay = (identity: PeerIdentity | undefined, peerId: string): string => {
  if (identity) {
    return formatIdentityDisplay(identity.tag, identity.displayName);
  }

  return peerId;
};

const run = async (): Promise<void> => {
  const roomId = getRoomId();
  const signalingUrl = getSignalingUrl();

  setRoom(roomId);
  setStatus("Connecting");

  let keypair = await getOrCreateKeypair();
  let publicKeyHex = await getPublicKeyHex(keypair);
  let identityTag = deriveIdentityTag(publicKeyHex);
  let displayName = getDisplayName();

  const buildLocalIdentity = (): PeerIdentity => ({
    publicKeyHex,
    tag: identityTag,
    displayName
  });

  const updateLocalIdentityDisplay = (): void => {
    setLocalIdentityDisplay(formatIdentityDisplay(identityTag, displayName));
  };

  updateLocalIdentityDisplay();
  setDisplayNameInputValue(displayName);

  const noiseSuppressor = new NoiseSuppressor();
  await noiseSuppressor.init();
  if (noiseSuppressor.isMobile()) {
    setNoiseSuppressionUnavailable();
  } else {
    setNoiseSuppressionEnabled(noiseSuppressor.isEnabled());
  }

  const localAudio = await createLocalAudioController({ noiseSuppressor });
  const vad = new VoiceActivityDetector(noiseSuppressor, { threshold: 0.5 });
  const vadSupported = noiseSuppressor.isVadAvailable();
  let vadRequestedEnabled = vadSupported;

  if (vadSupported) {
    vad.start(localAudio.outgoingTrack);
    setVadEnabled(true);
    setVadState(true);
  } else {
    setVadUnavailable();
  }

  const ptt = new PushToTalk({ key: "`" });
  ptt.start(localAudio.outgoingTrack);
  setPttEnabled(false, ptt.getKey());
  setPttState(false, false);

  setMuteLabel(localAudio.isMuted());

  const stopLocalMonitor = localAudio.monitorSpeaking((speaking) => {
    setLocalSpeaking(speaking);
  });

  const remoteMonitors = new Map<string, AudioMonitorStop>();
  const peerIdentityById = new Map<string, PeerIdentity>();
  const socket = new WebSocket(signalingUrl);

  const sendIdentityUpdate = (): void => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "update-identity",
        identity: buildLocalIdentity()
      })
    );
  };

  const peerManager = new PeerManager({
    localStream: localAudio.stream,
    iceServers,
    sendSignal: (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    onRemoteStream: (peerId, stream) => {
      const label = formatPeerDisplay(peerIdentityById.get(peerId), peerId);
      upsertPeer(peerId, label, false);

      const currentMonitor = remoteMonitors.get(peerId);
      if (currentMonitor) {
        currentMonitor();
      }

      const stopMonitor = monitorRemoteAudio(stream, (speaking) => {
        const peerLabel = formatPeerDisplay(peerIdentityById.get(peerId), peerId);
        upsertPeer(peerId, peerLabel, speaking);
      });

      remoteMonitors.set(peerId, stopMonitor);
    },
    onPeerRemoved: (peerId) => {
      const stopMonitor = remoteMonitors.get(peerId);
      if (stopMonitor) {
        stopMonitor();
      }

      remoteMonitors.delete(peerId);
      peerIdentityById.delete(peerId);
      removePeer(peerId);
    }
  });

  onMuteToggle(() => {
    const muted = localAudio.toggleMute();
    setMuteLabel(muted);
  });

  onNoiseSuppressionToggle(() => {
    if (noiseSuppressor.isMobile()) {
      return;
    }

    const nextState = !noiseSuppressor.isEnabled();
    noiseSuppressor.setEnabled(nextState);
    setNoiseSuppressionEnabled(nextState);
  });

  onVadToggle(() => {
    if (!vadSupported) {
      return;
    }

    vadRequestedEnabled = !vadRequestedEnabled;

    if (ptt.isEnabled()) {
      setVadEnabled(false);
      return;
    }

    vad.setEnabled(vadRequestedEnabled);
    setVadEnabled(vadRequestedEnabled);

    if (!vadRequestedEnabled) {
      setVadState(true);
    }
  });

  onPttToggle(() => {
    const nextEnabled = !ptt.isEnabled();
    ptt.setEnabled(nextEnabled);
    setPttEnabled(nextEnabled, ptt.getKey());

    if (nextEnabled) {
      vad.setEnabled(false);
      if (vadSupported) {
        setVadEnabled(false);
        setVadState(false);
      }
    } else {
      if (vadSupported) {
        vad.setEnabled(vadRequestedEnabled);
        setVadEnabled(vadRequestedEnabled);
      }
    }
  });

  onDisplayNameSubmit((value) => {
    setDisplayName(value);
    displayName = getDisplayName();
    setDisplayNameInputValue(displayName);
    updateLocalIdentityDisplay();
    sendIdentityUpdate();
  });

  onExportIdentity(() => {
    void exportKeypairToFile(keypair);
  });

  onImportIdentity((file) => {
    void (async () => {
      try {
        keypair = await importKeypairFromFile(file);
        publicKeyHex = await getPublicKeyHex(keypair);
        identityTag = deriveIdentityTag(publicKeyHex);
        displayName = getDisplayName();
        updateLocalIdentityDisplay();
        sendIdentityUpdate();
        console.log(`[identity] Identity restored: ${identityTag}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown import error";
        setStatus(`Error: ${message}`);
      }
    })();
  });

  const statusTicker = window.setInterval(() => {
    setPttState(ptt.isEnabled(), ptt.isTransmitting());

    if (vadSupported && !ptt.isEnabled()) {
      setVadState(vad.isVoiceActive());
    }
  }, 50);

  socket.addEventListener("open", () => {
    setStatus("Connected");
    socket.send(
      JSON.stringify({
        type: "join",
        room: roomId,
        identity: buildLocalIdentity()
      })
    );
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    peerManager.dispose();

    for (const stopMonitor of remoteMonitors.values()) {
      stopMonitor();
    }

    remoteMonitors.clear();
    peerIdentityById.clear();
  });

  socket.addEventListener("error", () => {
    setStatus("Disconnected");
  });

  socket.addEventListener("message", async (event) => {
    const payload = typeof event.data === "string" ? event.data : String(event.data);
    const message = parseIncomingMessage(payload);

    if (!message) {
      return;
    }

    if (message.type === "peer-list") {
      for (const peer of message.peers) {
        if (peer.identity) {
          peerIdentityById.set(peer.peerId, peer.identity);
        }

        const peerLabel = formatPeerDisplay(peer.identity, peer.peerId);
        upsertPeer(peer.peerId, peerLabel, false);
      }

      return;
    }

    if (message.type === "peer-joined") {
      if (message.identity) {
        peerIdentityById.set(message.peerId, message.identity);
      }

      const peerLabel = formatPeerDisplay(peerIdentityById.get(message.peerId), message.peerId);
      console.log(`[peers] Connected: ${peerLabel}`);
      upsertPeer(message.peerId, peerLabel, false);
      await peerManager.createOffer(message.peerId);
      return;
    }

    if (message.type === "peer-left") {
      const identity = message.identity ?? peerIdentityById.get(message.peerId);
      const disconnectedLabel = identity?.tag ?? message.peerId;
      console.log(`[peers] Disconnected: ${disconnectedLabel}`);
      peerManager.removePeer(message.peerId);
      return;
    }

    if (message.type === "peer-identity-updated") {
      peerIdentityById.set(message.peerId, message.identity);
      const peerLabel = formatIdentityDisplay(message.identity.tag, message.identity.displayName);
      setPeerLabel(message.peerId, peerLabel);
      console.log(
        `[peers] ${message.identity.tag} updated display name to "${message.identity.displayName ?? ""}"`
      );
      return;
    }

    if (message.type === "offer") {
      if (message.identity) {
        peerIdentityById.set(message.from, message.identity);
      }

      const peerLabel = formatPeerDisplay(peerIdentityById.get(message.from), message.from);
      upsertPeer(message.from, peerLabel, false);
      await peerManager.handleOffer(message.from, message.sdp);
      return;
    }

    if (message.type === "answer") {
      if (message.identity) {
        peerIdentityById.set(message.from, message.identity);
        const peerLabel = formatPeerDisplay(message.identity, message.from);
        setPeerLabel(message.from, peerLabel);
      }

      await peerManager.handleAnswer(message.from, message.sdp);
      return;
    }

    if (message.type === "ice-candidate") {
      if (message.identity) {
        peerIdentityById.set(message.from, message.identity);
      }

      await peerManager.handleIceCandidate(message.from, message.candidate);
      return;
    }

    if (message.type === "error") {
      setStatus(`Error: ${message.message}`);
    }
  });

  window.addEventListener("beforeunload", () => {
    window.clearInterval(statusTicker);
    stopLocalMonitor();
    if (vadSupported) {
      vad.stop();
    }
    ptt.stop();
    localAudio.dispose();
    noiseSuppressor.destroy();
    peerManager.dispose();
    socket.close();

    for (const stopMonitor of remoteMonitors.values()) {
      stopMonitor();
    }
  });
};

void run();
