export interface TavernSettings {
  theme: string;
  notificationsEnabled: boolean;
  pttKey: string;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  peerVolumes: Record<string, number>;
  customSkinCss: string | null;
  selectedSkinName: string | null;
  signalingUrl: string;
}

const STORAGE_KEY = "tavern-settings";

const defaultSettings: TavernSettings = {
  theme: "dark",
  notificationsEnabled: true,
  pttKey: "`",
  inputDeviceId: null,
  outputDeviceId: null,
  peerVolumes: {},
  customSkinCss: null,
  selectedSkinName: null,
  signalingUrl: ""
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const loadSettings = (): TavernSettings => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return { ...defaultSettings };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...defaultSettings };
  }

  if (!isObject(parsed)) {
    return { ...defaultSettings };
  }

  return {
    theme: typeof parsed.theme === "string" ? parsed.theme : defaultSettings.theme,
    notificationsEnabled:
      typeof parsed.notificationsEnabled === "boolean"
        ? parsed.notificationsEnabled
        : defaultSettings.notificationsEnabled,
    pttKey: typeof parsed.pttKey === "string" ? parsed.pttKey : defaultSettings.pttKey,
    inputDeviceId: typeof parsed.inputDeviceId === "string" ? parsed.inputDeviceId : null,
    outputDeviceId: typeof parsed.outputDeviceId === "string" ? parsed.outputDeviceId : null,
    peerVolumes: isObject(parsed.peerVolumes)
      ? Object.fromEntries(
          Object.entries(parsed.peerVolumes).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number"
          )
        )
      : {},
    customSkinCss: typeof parsed.customSkinCss === "string" ? parsed.customSkinCss : null,
    selectedSkinName: typeof parsed.selectedSkinName === "string" ? parsed.selectedSkinName : null,
    signalingUrl: typeof parsed.signalingUrl === "string" ? parsed.signalingUrl : ""
  };
};

export const saveSettings = (settings: TavernSettings): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const updateSettings = (patch: Partial<TavernSettings>): TavernSettings => {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
};
