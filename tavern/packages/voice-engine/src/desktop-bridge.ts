type TrayState = "connected" | "disconnected" | "muted";

type TauriCore = {
  invoke: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
};

type TauriEvent = {
  listen: (
    eventName: string,
    handler: (event: { payload: unknown }) => void
  ) => Promise<() => void>;
};

type TauriGlobal = {
  core?: TauriCore;
  event?: TauriEvent;
};

type DesktopWindow = Window & {
  __TAURI__?: TauriGlobal;
};

const desktopWindow = window as DesktopWindow;

export const isDesktop = (): boolean => {
  return typeof desktopWindow.__TAURI__ !== "undefined";
};

const invoke = async (command: string, payload?: Record<string, unknown>): Promise<void> => {
  if (!desktopWindow.__TAURI__?.core) {
    return;
  }

  await desktopWindow.__TAURI__.core.invoke(command, payload);
};

export const setTrayState = async (state: TrayState): Promise<void> => {
  await invoke("set_tray_state", { state });
};

export const setGlobalPttKey = async (accelerator: string): Promise<void> => {
  await invoke("set_global_ptt_key", { accelerator });
};

export const notifyDesktop = async (title: string, body: string): Promise<void> => {
  await invoke("notify_desktop", { title, body });
};

export const listDesktopSkins = async (): Promise<Array<{ name: string; css: string }>> => {
  if (!desktopWindow.__TAURI__?.core) {
    return [];
  }

  const result = await desktopWindow.__TAURI__.core.invoke("list_skins");

  if (!Array.isArray(result)) {
    return [];
  }

  return result.filter(
    (entry): entry is { name: string; css: string } =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      typeof (entry as Record<string, unknown>).css === "string"
  );
};

export const onDesktopPtt = async (
  onDown: () => void,
  onUp: () => void
): Promise<(() => void) | null> => {
  const tauriEvent = desktopWindow.__TAURI__?.event;

  if (!tauriEvent) {
    return null;
  }

  const offDown = await tauriEvent.listen("ptt-down", () => onDown());
  const offUp = await tauriEvent.listen("ptt-up", () => onUp());

  return () => {
    offDown();
    offUp();
  };
};

export const onDesktopEvent = async (
  eventName: string,
  handler: () => void
): Promise<(() => void) | null> => {
  const tauriEvent = desktopWindow.__TAURI__?.event;

  if (!tauriEvent) {
    return null;
  }

  const off = await tauriEvent.listen(eventName, () => handler());

  return () => {
    off();
  };
};
