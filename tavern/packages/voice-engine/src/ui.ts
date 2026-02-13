// DOM helpers for voice UI state: status, peers, noise suppression, VAD, and PTT.

const titleElement = document.getElementById("title");
const statusElement = document.getElementById("status");
const localSpeakingElement = document.getElementById("local-speaking");
const peerListElement = document.getElementById("peer-list");
const muteButtonElement = document.getElementById("mute-button") as HTMLButtonElement | null;
const noiseToggleElement = document.getElementById("noise-toggle") as HTMLButtonElement | null;
const noiseStatusElement = document.getElementById("noise-status");
const vadToggleElement = document.getElementById("vad-toggle") as HTMLButtonElement | null;
const vadStatusElement = document.getElementById("vad-status");
const pttToggleElement = document.getElementById("ptt-toggle") as HTMLButtonElement | null;
const pttStatusElement = document.getElementById("ptt-status");

const peerRows = new Map<string, HTMLLIElement>();

const requiredElement = <T extends Element>(value: T | null, id: string): T => {
  if (!value) {
    throw new Error(`Missing required element: ${id}`);
  }

  return value;
};

const title = requiredElement(titleElement, "title");
const status = requiredElement(statusElement, "status");
const localSpeaking = requiredElement(localSpeakingElement, "local-speaking");
const peerList = requiredElement(peerListElement, "peer-list");
const muteButton = requiredElement(muteButtonElement, "mute-button");
const noiseToggle = requiredElement(noiseToggleElement, "noise-toggle");
const noiseStatus = requiredElement(noiseStatusElement, "noise-status");
const vadToggle = requiredElement(vadToggleElement, "vad-toggle");
const vadStatus = requiredElement(vadStatusElement, "vad-status");
const pttToggle = requiredElement(pttToggleElement, "ptt-toggle");
const pttStatus = requiredElement(pttStatusElement, "ptt-status");

const createPeerRow = (peerId: string): HTMLLIElement => {
  const row = document.createElement("li");
  row.dataset.peerId = peerId;

  const dot = document.createElement("span");
  dot.className = "dot silent";

  const label = document.createElement("span");
  label.textContent = peerId;

  row.append(dot, label);
  return row;
};

const setStateClass = (element: Element, on: boolean): void => {
  element.classList.toggle("state-on", on);
  element.classList.toggle("state-off", !on);
};

export const setRoom = (roomId: string): void => {
  title.textContent = `Tavern - Room: ${roomId}`;
};

export const setStatus = (label: string): void => {
  status.textContent = `Status: ${label}`;
};

export const setLocalSpeaking = (isSpeaking: boolean): void => {
  localSpeaking.textContent = `You: ${isSpeaking ? "speaking" : "silent"}`;
};

export const setMuteLabel = (isMuted: boolean): void => {
  muteButton.textContent = isMuted ? "Unmute" : "Mute";
};

export const onMuteToggle = (handler: () => void): void => {
  muteButton.addEventListener("click", handler);
};

export const setNoiseSuppressionEnabled = (enabled: boolean): void => {
  noiseToggle.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
  noiseStatus.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
  setStateClass(noiseToggle, enabled);
  setStateClass(noiseStatus, enabled);
};

export const setNoiseSuppressionUnavailable = (): void => {
  noiseToggle.textContent = "🔇 Noise Suppression: N/A (mobile)";
  noiseToggle.disabled = true;
  noiseStatus.textContent = "🔇 Noise Suppression: N/A (mobile)";
  setStateClass(noiseToggle, false);
  setStateClass(noiseStatus, false);
};

export const onNoiseSuppressionToggle = (handler: () => void): void => {
  noiseToggle.addEventListener("click", handler);
};

export const setVadEnabled = (enabled: boolean): void => {
  vadToggle.textContent = `VAD: ${enabled ? "ON" : "OFF"}`;
  setStateClass(vadToggle, enabled);
};

export const setVadUnavailable = (): void => {
  vadToggle.textContent = "VAD: N/A (mobile)";
  vadToggle.disabled = true;
  vadStatus.textContent = "VAD unavailable on mobile";
  setStateClass(vadToggle, false);
  setStateClass(vadStatus, false);
};

export const setVadState = (voiceActive: boolean): void => {
  vadStatus.textContent = voiceActive ? "🟢 Voice Detected" : "⚪ Silent";
  setStateClass(vadStatus, voiceActive);
};

export const onVadToggle = (handler: () => void): void => {
  vadToggle.addEventListener("click", handler);
};

export const setPttEnabled = (enabled: boolean, key: string): void => {
  pttToggle.textContent = enabled ? `PTT: ON (hold ${key})` : "PTT: OFF";
  setStateClass(pttToggle, enabled);
};

export const setPttState = (enabled: boolean, transmitting: boolean): void => {
  if (!enabled) {
    pttStatus.textContent = "PTT disabled";
    setStateClass(pttStatus, false);
    return;
  }

  pttStatus.textContent = transmitting ? "🔴 Transmitting" : "⚫ PTT Ready";
  setStateClass(pttStatus, transmitting);
};

export const onPttToggle = (handler: () => void): void => {
  pttToggle.addEventListener("click", handler);
};

export const upsertPeer = (peerId: string, speaking: boolean): void => {
  const existingRow = peerRows.get(peerId) ?? createPeerRow(peerId);
  const dot = existingRow.querySelector(".dot");

  if (!dot) {
    return;
  }

  dot.classList.toggle("speaking", speaking);
  dot.classList.toggle("silent", !speaking);

  if (!peerRows.has(peerId)) {
    peerRows.set(peerId, existingRow);
    peerList.append(existingRow);
  }
};

export const removePeer = (peerId: string): void => {
  const row = peerRows.get(peerId);
  if (!row) {
    return;
  }

  row.remove();
  peerRows.delete(peerId);
};
