import type { Channel, SavedTavern } from "../../shared/src/types.js";
import { closeSettings, openSettings } from "./ui/settings.js";

export type ParticipantView = {
  publicKeyHex: string;
  displayName: string;
  tag: string;
  isSpeaking: boolean;
  isSelf: boolean;
  volume: number;
};

type DeviceOption = {
  id: string;
  label: string;
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
};

const statusElement = byId<HTMLParagraphElement>("status");
const roomElement = byId<HTMLParagraphElement>("active-room");
const localIdentityElement = byId<HTMLParagraphElement>("local-identity");
const localSpeakingElement = byId<HTMLParagraphElement>("local-speaking");
const tavernListElement = byId<HTMLUListElement>("tavern-list");
const channelListElement = byId<HTMLUListElement>("channel-list");
const participantListElement = byId<HTMLUListElement>("participant-list");
const displayNameInput = byId<HTMLInputElement>("display-name-input");
const displayNameSetButton = byId<HTMLButtonElement>("display-name-set");
const createButton = byId<HTMLButtonElement>("create-tavern-button");
const joinButton = byId<HTMLButtonElement>("join-tavern-button");
const createNameInput = byId<HTMLInputElement>("create-tavern-name");
const createIconInput = byId<HTMLInputElement>("create-tavern-icon");
const joinCodeInput = byId<HTMLInputElement>("join-invite-code");
const copyInviteButton = byId<HTMLButtonElement>("copy-invite-button");
const createChannelButton = byId<HTMLButtonElement>("create-channel-button");
const createChannelInput = byId<HTMLInputElement>("create-channel-name");
const muteButton = byId<HTMLButtonElement>("mute-button");
const noiseToggleButton = byId<HTMLButtonElement>("noise-toggle");
const noiseStatusElement = byId<HTMLParagraphElement>("noise-status");
const vadToggleButton = byId<HTMLButtonElement>("vad-toggle");
const vadStatusElement = byId<HTMLParagraphElement>("vad-status");
const pttToggleButton = byId<HTMLButtonElement>("ptt-toggle");
const pttStatusElement = byId<HTMLParagraphElement>("ptt-status");
const inviteFeedbackElement = byId<HTMLParagraphElement>("invite-feedback");
const settingsButton = byId<HTMLButtonElement>("settings-button");
const settingsCloseButton = byId<HTMLButtonElement>("settings-close");
const themeSelect = byId<HTMLSelectElement>("theme-select");
const skinSelect = byId<HTMLSelectElement>("skin-select");
const skinUploadInput = byId<HTMLInputElement>("skin-upload");
const skinResetButton = byId<HTMLButtonElement>("skin-reset");
const inputDeviceSelect = byId<HTMLSelectElement>("input-device-select");
const outputDeviceSelect = byId<HTMLSelectElement>("output-device-select");
const notificationsToggle = byId<HTMLInputElement>("notifications-toggle");
const pttKeyInput = byId<HTMLInputElement>("ptt-key-input");
const pttKeySetButton = byId<HTMLButtonElement>("ptt-key-set");
const exportIdentityButton = byId<HTMLButtonElement>("export-identity");
const importIdentityButton = byId<HTMLButtonElement>("import-identity");
const importIdentityFileInput = byId<HTMLInputElement>("import-identity-file");

const participantRows = new Map<string, HTMLLIElement>();

const setStateClass = (element: Element, on: boolean): void => {
  element.classList.toggle("state-on", on);
  element.classList.toggle("state-off", !on);
};

export const setStatus = (value: string): void => {
  statusElement.textContent = `Status: ${value}`;
};

export const setActiveRoom = (tavernName: string | null, channelName: string | null): void => {
  if (!tavernName || !channelName) {
    roomElement.textContent = "Connected to: none";
    return;
  }

  roomElement.textContent = `Connected to: ${tavernName} / # ${channelName}`;
};

export const setLocalIdentityDisplay = (value: string): void => {
  localIdentityElement.textContent = `You: ${value}`;
};

export const setLocalSpeaking = (isSpeaking: boolean): void => {
  localSpeakingElement.textContent = `Local speaking: ${isSpeaking ? "yes" : "no"}`;
};

export const setDisplayNameInputValue = (value: string | null): void => {
  displayNameInput.value = value ?? "";
};

export const onDisplayNameSubmit = (handler: (value: string) => void): void => {
  const submit = (): void => {
    handler(displayNameInput.value);
  };

  displayNameSetButton.addEventListener("click", submit);
  displayNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submit();
    }
  });
};

export const renderTaverns = (
  taverns: SavedTavern[],
  activeTavernId: string | null,
  onSelect: (tavernId: string) => void
): void => {
  tavernListElement.replaceChildren();

  for (const tavern of taverns) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tavern-server-button";
    button.textContent = tavern.icon || tavern.name.slice(0, 1).toUpperCase();
    button.title = tavern.name;

    if (activeTavernId === tavern.id) {
      button.classList.add("tavern-server-active");
    }

    button.addEventListener("click", () => onSelect(tavern.id));

    const row = document.createElement("li");
    row.className = "tavern-server-row";
    row.append(button);
    tavernListElement.append(row);
  }
};

export const renderChannels = (
  channels: Channel[],
  activeChannelId: string | null,
  onSelect: (channelId: string) => void
): void => {
  channelListElement.replaceChildren();

  for (const channel of channels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tavern-channel-button";
    button.textContent = `# ${channel.name} (${channel.peers.length})`;

    if (activeChannelId === channel.id) {
      button.classList.add("tavern-channel-active");
    }

    button.addEventListener("click", () => onSelect(channel.id));

    const row = document.createElement("li");
    row.className = "tavern-channel-row";
    row.append(button);
    channelListElement.append(row);
  }
};

export const setParticipants = (
  participants: ParticipantView[],
  onVolumeChange: (publicKeyHex: string, value: number) => void
): void => {
  participantRows.clear();
  participantListElement.replaceChildren();

  for (const participant of participants) {
    const row = document.createElement("li");
    row.className = "tavern-participant-row";
    row.dataset.publicKeyHex = participant.publicKeyHex;

    const dot = document.createElement("span");
    dot.className = "tavern-peer-dot";
    dot.classList.add(participant.isSpeaking ? "tavern-peer-dot-speaking" : "tavern-peer-dot-silent");

    const textWrap = document.createElement("div");
    textWrap.className = "tavern-participant-text";

    const name = document.createElement("p");
    name.className = "tavern-participant-name";
    name.textContent = participant.isSelf ? `${participant.displayName} (you)` : participant.displayName;

    const identity = document.createElement("p");
    identity.className = "tavern-participant-identity";
    identity.textContent = participant.tag;

    textWrap.append(name, identity);

    row.append(dot, textWrap);

    if (!participant.isSelf) {
      const volumeSlider = document.createElement("input");
      volumeSlider.type = "range";
      volumeSlider.min = "0";
      volumeSlider.max = "200";
      volumeSlider.value = String(participant.volume);
      volumeSlider.className = "tavern-volume-slider";
      volumeSlider.addEventListener("input", () => {
        onVolumeChange(participant.publicKeyHex, Number.parseInt(volumeSlider.value, 10));
      });
      row.append(volumeSlider);
    }

    participantRows.set(participant.publicKeyHex, row);
    participantListElement.append(row);
  }
};

export const updateParticipantSpeaking = (publicKeyHex: string, speaking: boolean): void => {
  const row = participantRows.get(publicKeyHex);

  if (!row) {
    return;
  }

  const dot = row.querySelector(".tavern-peer-dot");

  if (!dot) {
    return;
  }

  dot.classList.toggle("tavern-peer-dot-speaking", speaking);
  dot.classList.toggle("tavern-peer-dot-silent", !speaking);
};

export const onCreateTavern = (handler: (name: string, icon: string | null) => void): void => {
  createButton.addEventListener("click", () => {
    handler(createNameInput.value, createIconInput.value || null);
  });
};

export const onJoinTavern = (handler: (inviteCode: string) => void): void => {
  joinButton.addEventListener("click", () => {
    handler(joinCodeInput.value);
  });
};

export const onCopyInvite = (handler: () => void): void => {
  copyInviteButton.addEventListener("click", handler);
};

export const setInviteFeedback = (message: string): void => {
  inviteFeedbackElement.textContent = message;
};

export const onCreateChannel = (handler: (name: string) => void): void => {
  createChannelButton.addEventListener("click", () => {
    handler(createChannelInput.value);
  });
};

export const setMuteLabel = (isMuted: boolean): void => {
  muteButton.textContent = isMuted ? "Unmute" : "Mute";
};

export const onMuteToggle = (handler: () => void): void => {
  muteButton.addEventListener("click", handler);
};

export const setNoiseSuppressionEnabled = (enabled: boolean): void => {
  noiseToggleButton.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
  noiseStatusElement.textContent = `Noise Suppression: ${enabled ? "ON" : "OFF"}`;
  setStateClass(noiseToggleButton, enabled);
  setStateClass(noiseStatusElement, enabled);
};

export const setNoiseSuppressionUnavailable = (): void => {
  noiseToggleButton.textContent = "Noise Suppression: N/A (mobile)";
  noiseToggleButton.disabled = true;
  noiseStatusElement.textContent = "Noise Suppression: N/A (mobile)";
  setStateClass(noiseToggleButton, false);
  setStateClass(noiseStatusElement, false);
};

export const onNoiseSuppressionToggle = (handler: () => void): void => {
  noiseToggleButton.addEventListener("click", handler);
};

export const setVadEnabled = (enabled: boolean): void => {
  vadToggleButton.textContent = `VAD: ${enabled ? "ON" : "OFF"}`;
  setStateClass(vadToggleButton, enabled);
};

export const setVadUnavailable = (): void => {
  vadToggleButton.textContent = "VAD: N/A (mobile)";
  vadToggleButton.disabled = true;
  vadStatusElement.textContent = "VAD unavailable on mobile";
  setStateClass(vadToggleButton, false);
  setStateClass(vadStatusElement, false);
};

export const setVadState = (voiceActive: boolean): void => {
  vadStatusElement.textContent = voiceActive ? "Voice Detected" : "Silent";
  setStateClass(vadStatusElement, voiceActive);
};

export const onVadToggle = (handler: () => void): void => {
  vadToggleButton.addEventListener("click", handler);
};

export const setPttEnabled = (enabled: boolean, key: string): void => {
  pttToggleButton.textContent = enabled ? `PTT: ON (hold ${key})` : "PTT: OFF";
  setStateClass(pttToggleButton, enabled);
};

export const setPttState = (enabled: boolean, transmitting: boolean): void => {
  if (!enabled) {
    pttStatusElement.textContent = "PTT disabled";
    setStateClass(pttStatusElement, false);
    return;
  }

  pttStatusElement.textContent = transmitting ? "Transmitting" : "PTT Ready";
  setStateClass(pttStatusElement, transmitting);
};

export const onPttToggle = (handler: () => void): void => {
  pttToggleButton.addEventListener("click", handler);
};

export const onSettingsOpen = (handler: () => void): void => {
  settingsButton.addEventListener("click", () => {
    openSettings();
    handler();
  });
};

export const onSettingsClose = (handler: () => void): void => {
  settingsCloseButton.addEventListener("click", () => {
    closeSettings();
    handler();
  });
};

export const setThemeOptions = (activeTheme: string): void => {
  themeSelect.value = activeTheme;
};

export const onThemeChange = (handler: (theme: string) => void): void => {
  themeSelect.addEventListener("change", () => {
    handler(themeSelect.value);
  });
};

export const setSkinOptions = (
  skins: Array<{ name: string; value: string }>,
  selectedValue: string | null
): void => {
  skinSelect.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "None";
  skinSelect.append(defaultOption);

  for (const skin of skins) {
    const option = document.createElement("option");
    option.value = skin.value;
    option.textContent = skin.name;
    skinSelect.append(option);
  }

  skinSelect.value = selectedValue ?? "";
};

export const onSkinSelect = (handler: (value: string) => void): void => {
  skinSelect.addEventListener("change", () => {
    handler(skinSelect.value);
  });
};

export const onSkinUpload = (handler: (file: File) => void): void => {
  skinUploadInput.addEventListener("change", () => {
    const file = skinUploadInput.files?.[0];
    skinUploadInput.value = "";

    if (!file) {
      return;
    }

    handler(file);
  });
};

export const onSkinReset = (handler: () => void): void => {
  skinResetButton.addEventListener("click", handler);
};

const setSelectOptions = (
  select: HTMLSelectElement,
  options: DeviceOption[],
  selected: string | null
): void => {
  select.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "System default";
  select.append(defaultOption);

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    select.append(node);
  }

  select.value = selected ?? "";
};

export const setInputDeviceOptions = (options: DeviceOption[], selected: string | null): void => {
  setSelectOptions(inputDeviceSelect, options, selected);
};

export const setOutputDeviceOptions = (options: DeviceOption[], selected: string | null): void => {
  setSelectOptions(outputDeviceSelect, options, selected);
};

export const onInputDeviceChange = (handler: (deviceId: string | null) => void): void => {
  inputDeviceSelect.addEventListener("change", () => {
    handler(inputDeviceSelect.value || null);
  });
};

export const onOutputDeviceChange = (handler: (deviceId: string | null) => void): void => {
  outputDeviceSelect.addEventListener("change", () => {
    handler(outputDeviceSelect.value || null);
  });
};

export const setNotificationsEnabled = (enabled: boolean): void => {
  notificationsToggle.checked = enabled;
};

export const onNotificationsToggle = (handler: (enabled: boolean) => void): void => {
  notificationsToggle.addEventListener("change", () => {
    handler(notificationsToggle.checked);
  });
};

export const setPttKey = (value: string): void => {
  pttKeyInput.value = value;
};

export const onPttKeySubmit = (handler: (value: string) => void): void => {
  pttKeySetButton.addEventListener("click", () => {
    handler(pttKeyInput.value);
  });
};

export const onExportIdentity = (handler: () => void): void => {
  exportIdentityButton.addEventListener("click", handler);
};

export const onImportIdentity = (handler: (file: File) => void): void => {
  importIdentityButton.addEventListener("click", () => {
    importIdentityFileInput.click();
  });

  importIdentityFileInput.addEventListener("change", () => {
    const file = importIdentityFileInput.files?.[0];
    importIdentityFileInput.value = "";

    if (!file) {
      return;
    }

    handler(file);
  });
};
