export type SpeakingStop = () => void;

type SpeakingOptions = {
  threshold?: number;
  holdMs?: number;
  intervalMs?: number;
};

const defaultOptions: Required<SpeakingOptions> = {
  threshold: 0.06,
  holdMs: 300,
  intervalMs: 100
};

export const monitorSpeaking = (
  stream: MediaStream,
  onChange: (speaking: boolean) => void,
  options: SpeakingOptions = {}
): SpeakingStop => {
  const config = { ...defaultOptions, ...options };
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  let holdUntil = 0;

  const timer = window.setInterval(() => {
    analyser.getByteFrequencyData(bins);

    let total = 0;
    for (const value of bins) {
      total += value;
    }

    const rms = total / bins.length / 255;
    const now = performance.now();

    if (rms > config.threshold) {
      holdUntil = now + config.holdMs;
      if (!speaking) {
        speaking = true;
        onChange(true);
      }
      return;
    }

    if (speaking && now > holdUntil) {
      speaking = false;
      onChange(false);
    }
  }, config.intervalMs);

  return () => {
    window.clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
    void context.close();
  };
};
