// Browser client entry point wiring UI, signaling, Opus, RNNoise, VAD, and PTT.

import { iceServers } from "../../shared/src/ice-config.js";
import { createLocalAudioController, monitorRemoteAudio, type AudioMonitorStop } from "./audio.js";
import { NoiseSuppressor } from "./noise-suppression.js";
import { PeerManager } from "./peer-manager.js";
import { PushToTalk } from "./ptt.js";
import {
  onMuteToggle,
  onNoiseSuppressionToggle,
  onPttToggle,
  onVadToggle,
  removePeer,
  setLocalSpeaking,
  setMuteLabel,
  setNoiseSuppressionEnabled,
  setNoiseSuppressionUnavailable,
  setPttEnabled,
  setPttState,
  setRoom,
  setStatus,
  setVadEnabled,
  setVadState,
  setVadUnavailable,
  upsertPeer
} from "./ui.js";
import { VoiceActivityDetector } from "./vad.js";

type IncomingMessage =
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "offer"; from: string; sdp: string }
  | { type: "answer"; from: string; sdp: string }
  | { type: "ice-candidate"; from: string; candidate: string }
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

  if (candidate.type === "peer-joined" && typeof candidate.peerId === "string") {
    return { type: "peer-joined", peerId: candidate.peerId };
  }

  if (candidate.type === "peer-left" && typeof candidate.peerId === "string") {
    return { type: "peer-left", peerId: candidate.peerId };
  }

  if (
    candidate.type === "offer" &&
    typeof candidate.from === "string" &&
    typeof candidate.sdp === "string"
  ) {
    return { type: "offer", from: candidate.from, sdp: candidate.sdp };
  }

  if (
    candidate.type === "answer" &&
    typeof candidate.from === "string" &&
    typeof candidate.sdp === "string"
  ) {
    return { type: "answer", from: candidate.from, sdp: candidate.sdp };
  }

  if (
    candidate.type === "ice-candidate" &&
    typeof candidate.from === "string" &&
    typeof candidate.candidate === "string"
  ) {
    return {
      type: "ice-candidate",
      from: candidate.from,
      candidate: candidate.candidate
    };
  }

  if (candidate.type === "error" && typeof candidate.message === "string") {
    return { type: "error", message: candidate.message };
  }

  return null;
};

const run = async (): Promise<void> => {
  const roomId = getRoomId();
  const signalingUrl = getSignalingUrl();

  setRoom(roomId);
  setStatus("Connecting");

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
  const socket = new WebSocket(signalingUrl);

  const peerManager = new PeerManager({
    localStream: localAudio.stream,
    iceServers,
    sendSignal: (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    onRemoteStream: (peerId, stream) => {
      upsertPeer(peerId, false);

      const currentMonitor = remoteMonitors.get(peerId);
      if (currentMonitor) {
        currentMonitor();
      }

      const stopMonitor = monitorRemoteAudio(stream, (speaking) => {
        upsertPeer(peerId, speaking);
      });

      remoteMonitors.set(peerId, stopMonitor);
    },
    onPeerRemoved: (peerId) => {
      const stopMonitor = remoteMonitors.get(peerId);
      if (stopMonitor) {
        stopMonitor();
      }

      remoteMonitors.delete(peerId);
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

  const statusTicker = window.setInterval(() => {
    setPttState(ptt.isEnabled(), ptt.isTransmitting());

    if (vadSupported && !ptt.isEnabled()) {
      setVadState(vad.isVoiceActive());
    }
  }, 50);

  socket.addEventListener("open", () => {
    setStatus("Connected");
    socket.send(JSON.stringify({ type: "join", room: roomId }));
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    peerManager.dispose();

    for (const stopMonitor of remoteMonitors.values()) {
      stopMonitor();
    }

    remoteMonitors.clear();
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

    if (message.type === "peer-joined") {
      upsertPeer(message.peerId, false);
      await peerManager.createOffer(message.peerId);
      return;
    }

    if (message.type === "peer-left") {
      peerManager.removePeer(message.peerId);
      return;
    }

    if (message.type === "offer") {
      upsertPeer(message.from, false);
      await peerManager.handleOffer(message.from, message.sdp);
      return;
    }

    if (message.type === "answer") {
      await peerManager.handleAnswer(message.from, message.sdp);
      return;
    }

    if (message.type === "ice-candidate") {
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
