// DOM helpers for voice UI state: status, peers, noise suppression, VAD, and PTT.
const titleElement = document.getElementById("title");
const statusElement = document.getElementById("status");
const localSpeakingElement = document.getElementById("local-speaking");
const peerListElement = document.getElementById("peer-list");
const muteButtonElement = document.getElementById("mute-button");
const noiseToggleElement = document.getElementById("noise-toggle");
const noiseStatusElement = document.getElementById("noise-status");
const vadToggleElement = document.getElementById("vad-toggle");
const vadStatusElement = document.getElementById("vad-status");
const pttToggleElement = document.getElementById("ptt-toggle");
const pttStatusElement = document.getElementById("ptt-status");
const peerRows = new Map();
const requiredElement = (value, id) => {
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
const createPeerRow = (peerId) => {
    const row = document.createElement("li");
    row.dataset.peerId = peerId;
    const dot = document.createElement("span");
    dot.className = "dot silent";
    const label = document.createElement("span");
    label.textContent = peerId;
    row.append(dot, label);
    return row;
};
const setStateClass = (element, on) => {
    element.classList.toggle("state-on", on);
    element.classList.toggle("state-off", !on);
};
export const setRoom = (roomId) => {
    title.textContent = `Tavern - Room: ${roomId}`;
};
export const setStatus = (label) => {
    status.textContent = `Status: ${label}`;
};
export const setLocalSpeaking = (isSpeaking) => {
    localSpeaking.textContent = `You: ${isSpeaking ? "speaking" : "silent"}`;
};
export const setMuteLabel = (isMuted) => {
    muteButton.textContent = isMuted ? "Unmute" : "Mute";
};
export const onMuteToggle = (handler) => {
    muteButton.addEventListener("click", handler);
};
export const setNoiseSuppressionEnabled = (enabled) => {
    noiseToggle.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
    noiseStatus.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
    setStateClass(noiseStatus, enabled);
};
export const onNoiseSuppressionToggle = (handler) => {
    noiseToggle.addEventListener("click", handler);
};
export const setVadEnabled = (enabled) => {
    vadToggle.textContent = `VAD: ${enabled ? "ON" : "OFF"}`;
    setStateClass(vadToggle, enabled);
};
export const setVadState = (voiceActive) => {
    vadStatus.textContent = voiceActive ? "🟢 Voice Detected" : "⚪ Silent";
    setStateClass(vadStatus, voiceActive);
};
export const onVadToggle = (handler) => {
    vadToggle.addEventListener("click", handler);
};
export const setPttEnabled = (enabled, key) => {
    pttToggle.textContent = enabled ? `PTT: ON (hold ${key})` : "PTT: OFF";
    setStateClass(pttToggle, enabled);
};
export const setPttState = (enabled, transmitting) => {
    if (!enabled) {
        pttStatus.textContent = "PTT disabled";
        setStateClass(pttStatus, false);
        return;
    }
    pttStatus.textContent = transmitting ? "🔴 Transmitting" : "⚫ PTT Ready";
    setStateClass(pttStatus, transmitting);
};
export const onPttToggle = (handler) => {
    pttToggle.addEventListener("click", handler);
};
export const upsertPeer = (peerId, speaking) => {
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
export const removePeer = (peerId) => {
    const row = peerRows.get(peerId);
    if (!row) {
        return;
    }
    row.remove();
    peerRows.delete(peerId);
};
