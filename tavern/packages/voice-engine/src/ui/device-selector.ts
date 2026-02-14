import { updateSettings } from "../settings-store.js";

export type DeviceLists = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
};

export const enumerateAudioDevices = async (): Promise<DeviceLists> => {
  const devices = await navigator.mediaDevices.enumerateDevices();

  return {
    inputs: devices.filter((device) => device.kind === "audioinput"),
    outputs: devices.filter((device) => device.kind === "audiooutput")
  };
};

export const watchDeviceChanges = (handler: () => void): (() => void) => {
  navigator.mediaDevices.addEventListener("devicechange", handler);

  return () => {
    navigator.mediaDevices.removeEventListener("devicechange", handler);
  };
};

export const saveInputDevice = (deviceId: string | null): void => {
  updateSettings({ inputDeviceId: deviceId });
};

export const saveOutputDevice = (deviceId: string | null): void => {
  updateSettings({ outputDeviceId: deviceId });
};
