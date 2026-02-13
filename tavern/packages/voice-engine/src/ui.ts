// DOM helpers for voice UI state: status, identity, peers, suppression, VAD, and PTT.

const titleElement = document.getElementById("title");
const statusElement = document.getElementById("status");
const localSpeakingElement = document.getElementById("local-speaking");
const localIdentityElement = document.getElementById("local-identity");
const peerListElement = document.getElementById("peer-list");
const muteButtonElement = document.getElementById("mute-button") as HTMLButtonElement | null;
const noiseToggleElement = document.getElementById("noise-toggle") as HTMLButtonElement | null;
const noiseStatusElement = document.getElementById("noise-status");
const vadToggleElement = document.getElementById("vad-toggle") as HTMLButtonElement | null;
const vadStatusElement = document.getElementById("vad-status");
const pttToggleElement = document.getElementById("ptt-toggle") as HTMLButtonElement | null;
const pttStatusElement = document.getElementById("ptt-status");
const displayNameInputElement = document.getElementById("display-name-input") as HTMLInputElement | null;
const displayNameSetElement = document.getElementById("display-name-set") as HTMLButtonElement | null;
const exportIdentityElement = document.getElementById("export-identity") as HTMLButtonElement | null;
const importIdentityElement = document.getElementById("import-identity") as HTMLButtonElement | null;
const importIdentityFileElement = document.getElementById("import-identity-file") as HTMLInputElement | null;

type PeerRow = {
  row: HTMLLIElement;
  dot: HTMLSpanElement;
  label: HTMLSpanElement;
};

const peerRows = new Map<string, PeerRow>();

let localIdentityLabel = "Unknown";
let localMicMuted = false;
let localPttEnabled = false;
let localPttTransmitting = false;

const requiredElement = <T extends Element>(value: T | null, id: string): T => {
  if (!value) {
    throw new Error(`Missing required element: ${id}`);
  }

  return value;
};

const title = requiredElement(titleElement, "title");
const status = requiredElement(statusElement, "status");
const localSpeaking = requiredElement(localSpeakingElement, "local-speaking");
const localIdentity = requiredElement(localIdentityElement, "local-identity");
const peerList = requiredElement(peerListElement, "peer-list");
const muteButton = requiredElement(muteButtonElement, "mute-button");
const noiseToggle = requiredElement(noiseToggleElement, "noise-toggle");
const noiseStatus = requiredElement(noiseStatusElement, "noise-status");
const vadToggle = requiredElement(vadToggleElement, "vad-toggle");
const vadStatus = requiredElement(vadStatusElement, "vad-status");
const pttToggle = requiredElement(pttToggleElement, "ptt-toggle");
const pttStatus = requiredElement(pttStatusElement, "ptt-status");
const displayNameInput = requiredElement(displayNameInputElement, "display-name-input");
const displayNameSet = requiredElement(displayNameSetElement, "display-name-set");
const exportIdentityButton = requiredElement(exportIdentityElement, "export-identity");
const importIdentityButton = requiredElement(importIdentityElement, "import-identity");
const importIdentityFile = requiredElement(importIdentityFileElement, "import-identity-file");

const renderLocalIdentity = (): void => {
  const micState = localMicMuted ? "Mic Off" : "Mic On";
  let pttState = "PTT: OFF";

  if (localPttEnabled) {
    pttState = localPttTransmitting ? "PTT: Transmitting" : "PTT: Ready";
  }

  localIdentity.textContent = `You: ${localIdentityLabel} | ${micState} | ${pttState}`;
};

const createPeerRow = (peerId: string, labelText: string): PeerRow => {
  const row = document.createElement("li");
  row.className = "tavern-peer-row";
  row.dataset.peerId = peerId;

  const dot = document.createElement("span");
  dot.className = "tavern-peer-dot tavern-peer-dot-silent";

  const label = document.createElement("span");
  label.className = "tavern-peer-label";
  label.textContent = labelText;

  row.append(dot, label);
  return { row, dot, label };
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

export const setLocalIdentityDisplay = (label: string): void => {
  localIdentityLabel = label;
  renderLocalIdentity();
};

export const setDisplayNameInputValue = (value: string | null): void => {
  displayNameInput.value = value ?? "";
};

export const onDisplayNameSubmit = (handler: (value: string) => void): void => {
  const submit = (): void => {
    handler(displayNameInput.value);
  };

  displayNameSet.addEventListener("click", submit);
  displayNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submit();
    }
  });
};

export const onExportIdentity = (handler: () => void): void => {
  exportIdentityButton.addEventListener("click", handler);
};

export const onImportIdentity = (handler: (file: File) => void): void => {
  importIdentityButton.addEventListener("click", () => {
    importIdentityFile.click();
  });

  importIdentityFile.addEventListener("change", () => {
    const file = importIdentityFile.files?.[0];
    importIdentityFile.value = "";

    if (!file) {
      return;
    }

    handler(file);
  });
};

export const setLocalSpeaking = (isSpeaking: boolean): void => {
  localSpeaking.textContent = `You: ${isSpeaking ? "speaking" : "silent"}`;
};

export const setMuteLabel = (isMuted: boolean): void => {
  localMicMuted = isMuted;
  muteButton.textContent = isMuted ? "Unmute" : "Mute";
  renderLocalIdentity();
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
  noiseToggle.textContent = "Noise Suppression: N/A (mobile)";
  noiseToggle.disabled = true;
  noiseStatus.textContent = "Noise Suppression: N/A (mobile)";
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
  vadStatus.textContent = voiceActive ? "Voice Detected" : "Silent";
  setStateClass(vadStatus, voiceActive);
};

export const onVadToggle = (handler: () => void): void => {
  vadToggle.addEventListener("click", handler);
};

export const setPttEnabled = (enabled: boolean, key: string): void => {
  localPttEnabled = enabled;
  pttToggle.textContent = enabled ? `PTT: ON (hold ${key})` : "PTT: OFF";
  setStateClass(pttToggle, enabled);
  renderLocalIdentity();
};

export const setPttState = (enabled: boolean, transmitting: boolean): void => {
  localPttEnabled = enabled;
  localPttTransmitting = transmitting;

  if (!enabled) {
    pttStatus.textContent = "PTT disabled";
    setStateClass(pttStatus, false);
    renderLocalIdentity();
    return;
  }

  pttStatus.textContent = transmitting ? "Transmitting" : "PTT Ready";
  setStateClass(pttStatus, transmitting);
  renderLocalIdentity();
};

export const onPttToggle = (handler: () => void): void => {
  pttToggle.addEventListener("click", handler);
};

export const upsertPeer = (peerId: string, labelText: string, speaking: boolean): void => {
  const current = peerRows.get(peerId) ?? createPeerRow(peerId, labelText);
  current.label.textContent = labelText;
  current.dot.classList.toggle("tavern-peer-dot-speaking", speaking);
  current.dot.classList.toggle("tavern-peer-dot-silent", !speaking);

  if (!peerRows.has(peerId)) {
    peerRows.set(peerId, current);
    peerList.append(current.row);
  }
};

export const setPeerLabel = (peerId: string, labelText: string): void => {
  const existing = peerRows.get(peerId);

  if (!existing) {
    return;
  }

  existing.label.textContent = labelText;
};

export const removePeer = (peerId: string): void => {
  const row = peerRows.get(peerId);

  if (!row) {
    return;
  }

  row.row.remove();
  peerRows.delete(peerId);
};
