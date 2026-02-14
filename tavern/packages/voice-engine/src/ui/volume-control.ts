import { updateSettings } from "../settings-store.js";

export type VolumeControlStop = () => void;

export type PeerVolumeControl = {
  playbackStream: MediaStream;
  setVolume: (value: number) => void;
  stop: VolumeControlStop;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const createPeerVolumeControl = (
  stream: MediaStream,
  initialVolume: number,
  onSpeaking: (speaking: boolean) => void
): PeerVolumeControl => {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();

  analyser.fftSize = 256;
  source.connect(analyser);
  source.connect(gain);
  gain.connect(destination);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  let holdUntil = 0;

  const setVolume = (nextValue: number): void => {
    const normalized = clamp(nextValue, 0, 200) / 100;
    gain.gain.value = normalized;
  };

  setVolume(initialVolume);

  const timer = window.setInterval(() => {
    analyser.getByteFrequencyData(bins);

    let total = 0;
    for (const value of bins) {
      total += value;
    }

    const level = total / bins.length / 255;
    const now = performance.now();

    if (level > 0.06) {
      holdUntil = now + 300;
      if (!speaking) {
        speaking = true;
        onSpeaking(true);
      }
      return;
    }

    if (speaking && now > holdUntil) {
      speaking = false;
      onSpeaking(false);
    }
  }, 100);

  return {
    playbackStream: destination.stream,
    setVolume,
    stop: () => {
      window.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
      destination.disconnect();
      void context.close();
    }
  };
};

export const savePeerVolume = (publicKeyHex: string, value: number): void => {
  const existing = updateSettings({});
  updateSettings({
    peerVolumes: {
      ...existing.peerVolumes,
      [publicKeyHex]: value
    }
  });
};
