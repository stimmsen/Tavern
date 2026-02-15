import { iceServers } from "../../shared/src/ice-config.js";
import type { Channel, PeerIdentity, PeerInfo, SavedTavern, Tavern } from "../../shared/src/types.js";
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
import { createLocalAudioController } from "./audio.js";
import {
  isDesktop,
  listDesktopSkins,
  notifyDesktop,
  onDesktopEvent,
  onDesktopPtt,
  setGlobalPttKey,
  setTrayState
} from "./desktop-bridge.js";
import { MeshManager } from "./mesh.js";
import { NoiseSuppressor } from "./noise-suppression.js";
import { PushToTalk } from "./ptt.js";
import { loadSettings, saveSettings } from "./settings-store.js";
import {
  applySkinCss,
  applyTheme,
  resetSkin
} from "./ui/theme-manager.js";
import {
  enumerateAudioDevices,
  saveInputDevice,
  saveOutputDevice,
  watchDeviceChanges
} from "./ui/device-selector.js";
import { savePeerVolume, createPeerVolumeControl } from "./ui/volume-control.js";
import {
  onCopyInvite,
  onCreateChannel,
  onCreateTavern,
  onDisplayNameSubmit,
  onExportIdentity,
  onImportIdentity,
  onInputDeviceChange,
  onJoinTavern,
  onMuteToggle,
  onNoiseSuppressionToggle,
  onNotificationsToggle,
  onOutputDeviceChange,
  onPttKeySubmit,
  onPttToggle,
  onSettingsOpen,
  onSkinReset,
  onSkinSelect,
  onSkinUpload,
  onThemeChange,
  onVadToggle,
  renderChannels,
  renderTaverns,
  setActiveRoom,
  setDisplayNameInputValue,
  setInputDeviceOptions,
  setInviteFeedback,
  setLocalIdentityDisplay,
  setLocalSpeaking,
  setMuteLabel,
  setNoiseSuppressionEnabled,
  setNoiseSuppressionUnavailable,
  setNotificationsEnabled,
  setOutputDeviceOptions,
  setParticipants,
  setPttEnabled,
  setPttKey,
  setPttState,
  setSkinOptions,
  setStatus,
  setThemeOptions,
  setVadEnabled,
  setVadState,
  setVadUnavailable,
  updateParticipantSpeaking,
  type ParticipantView
} from "./ui.js";
import { VoiceActivityDetector } from "./vad.js";
import { buildInviteUrl, loadSavedTaverns, parseInvitePath, upsertSavedTavern } from "./tavern-client.js";

type IncomingMessage =
  | { type: "tavern-created"; tavern: Tavern }
  | { type: "tavern-info"; tavern: Tavern }
  | { type: "channel-created"; tavernId: string; channel: Channel }
  | { type: "channel-joined"; tavernId: string; channelId: string; peers: PeerInfo[] }
  | { type: "peer-joined-channel"; tavernId: string; channelId: string; peer: PeerInfo }
  | { type: "peer-left-channel"; tavernId: string; channelId: string; publicKeyHex: string }
  | { type: "offer"; from: string; sdp: string; tavernId?: string; channelId?: string }
  | { type: "answer"; from: string; sdp: string; tavernId?: string; channelId?: string }
  | { type: "ice-candidate"; from: string; candidate: string; tavernId?: string; channelId?: string }
  | { type: "error"; message: string };

type ParticipantState = {
  publicKeyHex: string;
  displayName: string;
  tag: string;
  isSelf: boolean;
  isSpeaking: boolean;
  volume: number;
};

const parseMessage = (raw: string): IncomingMessage | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const value = parsed as Record<string, unknown>;

  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }

  if (value.type === "tavern-created" && typeof value.tavern === "object" && value.tavern !== null) {
    return { type: "tavern-created", tavern: value.tavern as Tavern };
  }

  if (value.type === "tavern-info" && typeof value.tavern === "object" && value.tavern !== null) {
    return { type: "tavern-info", tavern: value.tavern as Tavern };
  }

  if (
    value.type === "channel-created" &&
    typeof value.tavernId === "string" &&
    typeof value.channel === "object" &&
    value.channel !== null
  ) {
    return { type: "channel-created", tavernId: value.tavernId, channel: value.channel as Channel };
  }

  if (
    value.type === "channel-joined" &&
    typeof value.tavernId === "string" &&
    typeof value.channelId === "string" &&
    Array.isArray(value.peers)
  ) {
    return {
      type: "channel-joined",
      tavernId: value.tavernId,
      channelId: value.channelId,
      peers: value.peers as PeerInfo[]
    };
  }

  if (
    value.type === "peer-joined-channel" &&
    typeof value.tavernId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.peer === "object" &&
    value.peer !== null
  ) {
    return {
      type: "peer-joined-channel",
      tavernId: value.tavernId,
      channelId: value.channelId,
      peer: value.peer as PeerInfo
    };
  }

  if (
    value.type === "peer-left-channel" &&
    typeof value.tavernId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.publicKeyHex === "string"
  ) {
    return {
      type: "peer-left-channel",
      tavernId: value.tavernId,
      channelId: value.channelId,
      publicKeyHex: value.publicKeyHex
    };
  }

  if (value.type === "offer" && typeof value.from === "string" && typeof value.sdp === "string") {
    return {
      type: "offer",
      from: value.from,
      sdp: value.sdp,
      tavernId: typeof value.tavernId === "string" ? value.tavernId : undefined,
      channelId: typeof value.channelId === "string" ? value.channelId : undefined
    };
  }

  if (value.type === "answer" && typeof value.from === "string" && typeof value.sdp === "string") {
    return {
      type: "answer",
      from: value.from,
      sdp: value.sdp,
      tavernId: typeof value.tavernId === "string" ? value.tavernId : undefined,
      channelId: typeof value.channelId === "string" ? value.channelId : undefined
    };
  }

  if (
    value.type === "ice-candidate" &&
    typeof value.from === "string" &&
    typeof value.candidate === "string"
  ) {
    return {
      type: "ice-candidate",
      from: value.from,
      candidate: value.candidate,
      tavernId: typeof value.tavernId === "string" ? value.tavernId : undefined,
      channelId: typeof value.channelId === "string" ? value.channelId : undefined
    };
  }

  return null;
};

const parseSkinFile = async (file: File): Promise<{ name: string; css: string } | null> => {
  const text = await file.text();

  if (file.name.endsWith(".css")) {
    return {
      name: file.name,
      css: text
    };
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.name !== "string" || typeof parsed.css !== "string") {
      return null;
    }

    return {
      name: parsed.name,
      css: parsed.css
    };
  } catch {
    return null;
  }
};

const run = async (): Promise<void> => {
  const settings = loadSettings();
  applyTheme(settings.theme);
  setThemeOptions(settings.theme);
  if (settings.customSkinCss) {
    applySkinCss(settings.customSkinCss, settings.selectedSkinName);
  }
  setNotificationsEnabled(settings.notificationsEnabled);
  setPttKey(settings.pttKey);

  const params = new URLSearchParams(window.location.search);
  const overrideUrl = params.get("ws")?.trim();
  const savedUrl = settings.signalingUrl?.trim();
  const signalingUrl =
    overrideUrl ||
    savedUrl ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`;

  // Populate server URL input
  const signalingUrlInput = document.getElementById("signaling-url-input") as HTMLInputElement | null;
  if (signalingUrlInput) {
    signalingUrlInput.value = settings.signalingUrl || "";
  }
  const signalingUrlButton = document.getElementById("signaling-url-set");
  signalingUrlButton?.addEventListener("click", () => {
    const newUrl = signalingUrlInput?.value.trim() || "";
    updateSettings({ signalingUrl: newUrl });
    window.location.reload();
  });

  const keypair = await getOrCreateKeypair();
  let publicKeyHex = await getPublicKeyHex(keypair);
  let tag = deriveIdentityTag(publicKeyHex);
  let displayName = getDisplayName();

  setDisplayNameInputValue(displayName);
  setLocalIdentityDisplay(formatIdentityDisplay(tag, displayName));

  const noiseSuppressor = new NoiseSuppressor();
  await noiseSuppressor.init();

  if (noiseSuppressor.isMobile()) {
    setNoiseSuppressionUnavailable();
  } else {
    setNoiseSuppressionEnabled(noiseSuppressor.isEnabled());
  }

  const localAudio = await createLocalAudioController({
    noiseSuppressor,
    inputDeviceId: settings.inputDeviceId
  });
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

  const ptt = new PushToTalk({ key: settings.pttKey });
  ptt.start(localAudio.outgoingTrack);
  setPttEnabled(false, ptt.getKey());
  setPttState(false, false);
  setMuteLabel(localAudio.isMuted());

  const socket = new WebSocket(signalingUrl);

  const participants = new Map<string, ParticipantState>();
  const volumeControls = new Map<string, ReturnType<typeof createPeerVolumeControl>>();
  const knownSkins = new Map<string, string>();

  let savedTaverns = loadSavedTaverns();
  let activeTavern: Tavern | null = null;
  let activeChannelId: string | null = null;
  let requestedTavernId: string | null = null;
  let autoJoinRequested = false;

  const localIdentity: PeerIdentity = {
    publicKeyHex,
    tag,
    displayName
  };

  const refreshSkinSelect = (): void => {
    const options = Array.from(knownSkins.entries()).map((entry) => ({ name: entry[0], value: entry[0] }));
    setSkinOptions(options, settings.selectedSkinName);
  };

  const refreshParticipants = (): void => {
    const list: ParticipantView[] = Array.from(participants.values()).map((entry) => ({
      publicKeyHex: entry.publicKeyHex,
      displayName: entry.displayName,
      tag: entry.tag,
      isSpeaking: entry.isSpeaking,
      isSelf: entry.isSelf,
      volume: entry.volume
    }));

    setParticipants(list, (peerPublicKeyHex, value) => {
      const participant = participants.get(peerPublicKeyHex);
      const control = volumeControls.get(peerPublicKeyHex);

      if (!participant || !control) {
        return;
      }

      participant.volume = value;
      control.setVolume(value);
      savePeerVolume(peerPublicKeyHex, value);
    });
  };

  const refreshTavernList = (): void => {
    renderTaverns(savedTaverns, activeTavern?.id ?? null, (tavernId) => {
      requestedTavernId = tavernId;
      autoJoinRequested = false;

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "get-tavern-info", tavernId }));
      }
    });
  };

  const refreshChannels = (): void => {
    renderChannels(activeTavern?.channels ?? [], activeChannelId, (channelId) => {
      if (!activeTavern || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (activeChannelId && activeChannelId !== channelId) {
        socket.send(
          JSON.stringify({
            type: "leave-channel",
            tavernId: activeTavern.id,
            channelId: activeChannelId
          })
        );
      }

      activeChannelId = channelId;
      socket.send(
        JSON.stringify({
          type: "join-channel",
          tavernId: activeTavern.id,
          channelId,
          identity: localIdentity
        })
      );
    });
  };

  const clearRemoteState = (): void => {
    for (const control of volumeControls.values()) {
      control.stop();
    }

    volumeControls.clear();
    participants.clear();
    participants.set(localIdentity.publicKeyHex, {
      publicKeyHex: localIdentity.publicKeyHex,
      displayName: localIdentity.displayName || localIdentity.tag,
      tag: localIdentity.tag,
      isSelf: true,
      isSpeaking: false,
      volume: 100
    });

    refreshParticipants();
  };

  const mesh = new MeshManager({
    localStream: localAudio.stream,
    iceServers,
    onSignal: (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    onRemoteStream: (peerPublicKeyHex, stream) => {
      const existing = volumeControls.get(peerPublicKeyHex);

      if (existing) {
        existing.stop();
      }

      const participant = participants.get(peerPublicKeyHex);
      const initialVolume = participant?.volume ?? settings.peerVolumes[peerPublicKeyHex] ?? 100;
      const control = createPeerVolumeControl(stream, initialVolume, (speaking) => {
        const entry = participants.get(peerPublicKeyHex);
        if (!entry) {
          return;
        }

        entry.isSpeaking = speaking;
        updateParticipantSpeaking(peerPublicKeyHex, speaking);
      });

      volumeControls.set(peerPublicKeyHex, control);
      return control.playbackStream;
    },
    onPeerRemoved: (peerPublicKeyHex) => {
      volumeControls.get(peerPublicKeyHex)?.stop();
      volumeControls.delete(peerPublicKeyHex);
      participants.delete(peerPublicKeyHex);
      refreshParticipants();
    }
  });

  clearRemoteState();

  onDisplayNameSubmit((value) => {
    setDisplayName(value);
    displayName = getDisplayName();
    localIdentity.displayName = displayName;
    setDisplayNameInputValue(displayName);
    setLocalIdentityDisplay(formatIdentityDisplay(localIdentity.tag, localIdentity.displayName));

    const self = participants.get(localIdentity.publicKeyHex);
    if (self) {
      self.displayName = localIdentity.displayName || localIdentity.tag;
      refreshParticipants();
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "update-identity", identity: localIdentity }));
    }
  });

  onExportIdentity(() => {
    void exportKeypairToFile(keypair);
  });

  onImportIdentity((file) => {
    void (async () => {
      try {
        const imported = await importKeypairFromFile(file);
        publicKeyHex = await getPublicKeyHex(imported);
        tag = deriveIdentityTag(publicKeyHex);
        localIdentity.publicKeyHex = publicKeyHex;
        localIdentity.tag = tag;
        setLocalIdentityDisplay(formatIdentityDisplay(localIdentity.tag, localIdentity.displayName));
      } catch (error) {
        console.warn("[identity] Import failed", error);
      }
    })();
  });

  onCreateTavern((name, icon) => {
    if (socket.readyState === WebSocket.OPEN && name.trim().length > 0) {
      socket.send(JSON.stringify({ type: "create-tavern", name: name.trim(), icon: icon?.trim() || undefined }));
    }
  });

  onJoinTavern((inviteCode) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const normalized = inviteCode.trim();
    if (normalized.length === 0) {
      return;
    }

    const tavernId = normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
    requestedTavernId = tavernId;
    autoJoinRequested = true;
    socket.send(JSON.stringify({ type: "get-tavern-info", tavernId }));
  });

  onCreateChannel((name) => {
    if (activeTavern && socket.readyState === WebSocket.OPEN && name.trim().length > 0) {
      socket.send(JSON.stringify({ type: "create-channel", tavernId: activeTavern.id, name: name.trim() }));
    }
  });

  onCopyInvite(async () => {
    if (!activeTavern) {
      setInviteFeedback("Select a tavern first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildInviteUrl(activeTavern.id));
      setInviteFeedback("Copied!");
    } catch {
      setInviteFeedback("Copy failed.");
    }
  });

  onThemeChange((theme) => {
    settings.theme = theme;
    saveSettings(settings);
    applyTheme(theme);
  });

  onSkinSelect((skinName) => {
    const css = skinName ? knownSkins.get(skinName) ?? null : null;
    applySkinCss(css, skinName || null);
    settings.selectedSkinName = skinName || null;
    settings.customSkinCss = css;
    saveSettings(settings);
  });

  onSkinUpload((file) => {
    void (async () => {
      const parsed = await parseSkinFile(file);
      if (!parsed) {
        console.warn("[skins] Invalid skin file");
        return;
      }

      knownSkins.set(parsed.name, parsed.css);
      refreshSkinSelect();
      applySkinCss(parsed.css, parsed.name);
      settings.selectedSkinName = parsed.name;
      settings.customSkinCss = parsed.css;
      saveSettings(settings);
    })();
  });

  onSkinReset(() => {
    resetSkin();
    settings.selectedSkinName = null;
    settings.customSkinCss = null;
    saveSettings(settings);
    refreshSkinSelect();
  });

  onNotificationsToggle((enabled) => {
    settings.notificationsEnabled = enabled;
    saveSettings(settings);
  });

  onPttKeySubmit((value) => {
    const key = value.trim() || "`";
    ptt.setKey(key);
    setPttKey(key);
    settings.pttKey = key;
    saveSettings(settings);
    void setGlobalPttKey(key);
  });

  onSettingsOpen(() => {
    void (async () => {
      const devices = await enumerateAudioDevices();
      setInputDeviceOptions(
        devices.inputs.map((device) => ({ id: device.deviceId, label: device.label || "Input device" })),
        settings.inputDeviceId
      );
      setOutputDeviceOptions(
        devices.outputs.map((device) => ({ id: device.deviceId, label: device.label || "Output device" })),
        settings.outputDeviceId
      );
    })();
  });

  onInputDeviceChange((deviceId) => {
    void (async () => {
      try {
        const track = await localAudio.setInputDevice(deviceId);
        await mesh.replaceOutgoingTrack(track);
        settings.inputDeviceId = deviceId;
        saveInputDevice(deviceId);
      } catch (error) {
        console.warn("[audio] Failed to switch input device", error);
      }
    })();
  });

  onOutputDeviceChange((deviceId) => {
    void mesh.setOutputDevice(deviceId);
    settings.outputDeviceId = deviceId;
    saveOutputDevice(deviceId);
  });

  onMuteToggle(() => {
    const muted = localAudio.toggleMute();
    setMuteLabel(muted);
    void setTrayState(muted ? "muted" : "connected");
  });

  onNoiseSuppressionToggle(() => {
    if (noiseSuppressor.isMobile()) {
      return;
    }

    const next = !noiseSuppressor.isEnabled();
    noiseSuppressor.setEnabled(next);
    setNoiseSuppressionEnabled(next);
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
    const next = !ptt.isEnabled();
    ptt.setEnabled(next);
    setPttEnabled(next, ptt.getKey());

    if (next) {
      vad.setEnabled(false);
      if (vadSupported) {
        setVadEnabled(false);
        setVadState(false);
      }
      return;
    }

    if (vadSupported) {
      vad.setEnabled(vadRequestedEnabled);
      setVadEnabled(vadRequestedEnabled);
    }
  });

  const unlistenDesktopPtt = await onDesktopPtt(
    () => {
      ptt.press();
    },
    () => {
      ptt.release();
    }
  );

  const unlistenTrayMute = await onDesktopEvent("tray-toggle-mute", () => {
    const muted = localAudio.toggleMute();
    setMuteLabel(muted);
    void setTrayState(muted ? "muted" : "connected");
  });

  const unlistenTrayDisconnect = await onDesktopEvent("tray-disconnect", () => {
    if (activeTavern && activeChannelId && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "leave-channel",
          tavernId: activeTavern.id,
          channelId: activeChannelId
        })
      );
      activeChannelId = null;
      setActiveRoom(activeTavern.name, null);
      mesh.clear();
      clearRemoteState();
      void setTrayState("disconnected");
    }
  });

  const stopWatchingDevices = watchDeviceChanges(() => {
    void (async () => {
      const devices = await enumerateAudioDevices();
      setInputDeviceOptions(
        devices.inputs.map((device) => ({ id: device.deviceId, label: device.label || "Input device" })),
        settings.inputDeviceId
      );
      setOutputDeviceOptions(
        devices.outputs.map((device) => ({ id: device.deviceId, label: device.label || "Output device" })),
        settings.outputDeviceId
      );
    })();
  });

  const statusTicker = window.setInterval(() => {
    setPttState(ptt.isEnabled(), ptt.isTransmitting());

    if (vadSupported && !ptt.isEnabled()) {
      const speaking = vad.isVoiceActive();
      setVadState(speaking);
      setLocalSpeaking(speaking);

      const self = participants.get(localIdentity.publicKeyHex);
      if (self) {
        self.isSpeaking = speaking;
        updateParticipantSpeaking(localIdentity.publicKeyHex, speaking);
      }
    }
  }, 50);

  socket.addEventListener("open", () => {
    setStatus("Connected");
    refreshTavernList();
    void setTrayState("disconnected");

    const inviteTavernId = parseInvitePath(window.location.pathname);
    if (inviteTavernId) {
      requestedTavernId = inviteTavernId;
      autoJoinRequested = true;
      socket.send(JSON.stringify({ type: "get-tavern-info", tavernId: inviteTavernId }));
    }

    void setGlobalPttKey(settings.pttKey);
    if (isDesktop()) {
      void (async () => {
        const skins = await listDesktopSkins();
        for (const skin of skins) {
          knownSkins.set(skin.name, skin.css);
        }
        refreshSkinSelect();
      })();
    } else {
      refreshSkinSelect();
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    setActiveRoom(null, null);
    mesh.clear();
    clearRemoteState();
    void setTrayState("disconnected");
  });

  socket.addEventListener("error", () => {
    setStatus("Disconnected");
  });

  socket.addEventListener("message", async (event) => {
    const payload = typeof event.data === "string" ? event.data : String(event.data);
    const message = parseMessage(payload);

    if (!message) {
      return;
    }

    if (message.type === "error") {
      setStatus(`Error: ${message.message}`);
      return;
    }

    if (message.type === "tavern-created") {
      const saved: SavedTavern = {
        id: message.tavern.id,
        name: message.tavern.name,
        icon: message.tavern.icon,
        inviteCode: message.tavern.id,
        lastJoined: new Date().toISOString()
      };

      savedTaverns = upsertSavedTavern(saved);
      requestedTavernId = message.tavern.id;
      autoJoinRequested = true;
      refreshTavernList();
      socket.send(JSON.stringify({ type: "get-tavern-info", tavernId: message.tavern.id }));
      return;
    }

    if (message.type === "tavern-info") {
      if (requestedTavernId && message.tavern.id !== requestedTavernId) {
        return;
      }

      const shouldAutoJoin = autoJoinRequested;
      requestedTavernId = null;
      autoJoinRequested = false;
      activeTavern = message.tavern;

      savedTaverns = upsertSavedTavern({
        id: message.tavern.id,
        name: message.tavern.name,
        icon: message.tavern.icon,
        inviteCode: message.tavern.id,
        lastJoined: new Date().toISOString()
      });

      refreshTavernList();
      refreshChannels();

      if (shouldAutoJoin) {
        const accepted = window.confirm(`Join ${message.tavern.name}?`);
        if (!accepted) {
          return;
        }

        const general =
          message.tavern.channels.find((channel) => channel.name.toLowerCase() === "general") ||
          message.tavern.channels[0];

        if (general) {
          activeChannelId = general.id;
          socket.send(
            JSON.stringify({
              type: "join-channel",
              tavernId: message.tavern.id,
              channelId: general.id,
              identity: localIdentity
            })
          );
        }
      }

      return;
    }

    if (message.type === "channel-created") {
      if (!activeTavern || activeTavern.id !== message.tavernId) {
        return;
      }

      activeTavern = {
        ...activeTavern,
        channels: [...activeTavern.channels, message.channel]
      };
      refreshChannels();
      return;
    }

    if (message.type === "channel-joined") {
      if (!activeTavern || activeTavern.id !== message.tavernId) {
        return;
      }

      activeChannelId = message.channelId;
      const channel = activeTavern.channels.find((entry) => entry.id === message.channelId);
      setActiveRoom(activeTavern.name, channel?.name ?? null);
      mesh.clear();
      clearRemoteState();

      for (const peer of message.peers) {
        const volume = settings.peerVolumes[peer.publicKeyHex] ?? 100;
        participants.set(peer.publicKeyHex, {
          publicKeyHex: peer.publicKeyHex,
          displayName: peer.displayName,
          tag: peer.tag ?? peer.displayName,
          isSelf: false,
          isSpeaking: false,
          volume
        });
      }

      refreshParticipants();
      refreshChannels();
      void setTrayState(localAudio.isMuted() ? "muted" : "connected");
      return;
    }

    if (message.type === "peer-joined-channel") {
      if (!activeTavern || !activeChannelId) {
        return;
      }

      if (message.tavernId !== activeTavern.id || message.channelId !== activeChannelId) {
        return;
      }

      participants.set(message.peer.publicKeyHex, {
        publicKeyHex: message.peer.publicKeyHex,
        displayName: message.peer.displayName,
        tag: message.peer.tag ?? message.peer.displayName,
        isSelf: false,
        isSpeaking: false,
        volume: settings.peerVolumes[message.peer.publicKeyHex] ?? 100
      });

      refreshParticipants();
      await mesh.createOffer(message.peer.publicKeyHex, message.tavernId, message.channelId);

      if (settings.notificationsEnabled && document.visibilityState !== "visible") {
        const body = `${message.peer.displayName} joined #${activeTavern.channels.find((channel) => channel.id === activeChannelId)?.name ?? "channel"}`;

        if (isDesktop()) {
          await notifyDesktop("Peer joined", body);
        } else if (Notification.permission === "granted") {
          new Notification("Peer joined", { body });
        }
      }

      return;
    }

    if (message.type === "peer-left-channel") {
      if (!activeTavern || !activeChannelId) {
        return;
      }

      if (message.tavernId !== activeTavern.id || message.channelId !== activeChannelId) {
        return;
      }

      const leftParticipant = participants.get(message.publicKeyHex);
      mesh.removePeer(message.publicKeyHex);
      participants.delete(message.publicKeyHex);
      refreshParticipants();

      if (leftParticipant && settings.notificationsEnabled && document.visibilityState !== "visible") {
        const body = `${leftParticipant.displayName} left #${activeTavern.channels.find((channel) => channel.id === activeChannelId)?.name ?? "channel"}`;

        if (isDesktop()) {
          await notifyDesktop("Peer left", body);
        } else if (Notification.permission === "granted") {
          new Notification("Peer left", { body });
        }
      }

      return;
    }

    if (message.type === "offer") {
      if (!activeTavern || !activeChannelId) {
        return;
      }

      if (message.tavernId !== activeTavern.id || message.channelId !== activeChannelId) {
        return;
      }

      await mesh.handleOffer(message.from, message.tavernId, message.channelId, message.sdp);
      return;
    }

    if (message.type === "answer") {
      if (!activeTavern || !activeChannelId) {
        return;
      }

      if (message.tavernId !== activeTavern.id || message.channelId !== activeChannelId) {
        return;
      }

      await mesh.handleAnswer(message.from, message.sdp);
      return;
    }

    if (message.type === "ice-candidate") {
      if (!activeTavern || !activeChannelId) {
        return;
      }

      if (message.tavernId !== activeTavern.id || message.channelId !== activeChannelId) {
        return;
      }

      await mesh.handleIceCandidate(message.from, message.candidate);
    }
  });

  if (!isDesktop() && settings.notificationsEnabled && Notification.permission === "default") {
    void Notification.requestPermission();
  }

  window.addEventListener("beforeunload", () => {
    window.clearInterval(statusTicker);

    if (activeTavern && activeChannelId && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "leave-channel",
          tavernId: activeTavern.id,
          channelId: activeChannelId
        })
      );
    }

    stopWatchingDevices();
    unlistenDesktopPtt?.();
    unlistenTrayMute?.();
    unlistenTrayDisconnect?.();
    mesh.clear();
    clearRemoteState();

    if (vadSupported) {
      vad.stop();
    }

    ptt.stop();
    localAudio.dispose();
    noiseSuppressor.destroy();
    socket.close();
  });
};

void run();
