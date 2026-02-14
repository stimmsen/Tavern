// Audio utilities for mic capture, local monitoring, mute control, and processed output.

import type { NoiseSuppressor } from "./noise-suppression.js";

const LEVEL_THRESHOLD = 0.06;

export type AudioMonitorStop = () => void;

type LocalAudioOptions = {
  noiseSuppressor: NoiseSuppressor;
  inputDeviceId?: string | null;
};

const requestMicrophoneStream = async (inputDeviceId?: string | null): Promise<MediaStream> => {
  if (inputDeviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: inputDeviceId }
      }
    });
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
};

const createMonitor = (
  audioContext: AudioContext,
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void
): AudioMonitorStop => {
  const monitorSource = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  monitorSource.connect(analyser);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  let isSpeaking = false;
  let rafId = 0;

  const tick = (): void => {
    analyser.getByteFrequencyData(bins);

    let total = 0;
    for (const value of bins) {
      total += value;
    }

    const level = total / bins.length / 255;
    const speaking = level > LEVEL_THRESHOLD;

    if (speaking !== isSpeaking) {
      isSpeaking = speaking;
      onSpeakingChange(isSpeaking);
    }

    rafId = window.requestAnimationFrame(tick);
  };

  tick();

  return () => {
    window.cancelAnimationFrame(rafId);
    monitorSource.disconnect();
    analyser.disconnect();
  };
};

export const createLocalAudioController = async (
  options: LocalAudioOptions
): Promise<{
  stream: MediaStream;
  outgoingTrack: MediaStreamTrack;
  isMuted: () => boolean;
  toggleMute: () => boolean;
  setInputDevice: (deviceId: string | null) => Promise<MediaStreamTrack>;
  monitorSpeaking: (onSpeakingChange: (speaking: boolean) => void) => AudioMonitorStop;
  dispose: () => void;
}> => {
  let microphoneStream = await requestMicrophoneStream(options.inputDeviceId);
  let [microphoneTrack] = microphoneStream.getAudioTracks();

  if (!microphoneTrack) {
    throw new Error("Microphone track is unavailable");
  }

  const audioContext = new AudioContext({ sampleRate: 48_000 });
  let sourceNode = audioContext.createMediaStreamSource(microphoneStream);
  let processorNode = await options.noiseSuppressor.createProcessorNode(audioContext, sourceNode);
  const destinationNode = audioContext.createMediaStreamDestination();
  processorNode.connect(destinationNode);

  const outgoingTrack = destinationNode.stream.getAudioTracks()[0];
  if (!outgoingTrack) {
    throw new Error("Processed outgoing track is unavailable");
  }

  const isMuted = (): boolean => {
    return !microphoneTrack.enabled;
  };

  const toggleMute = (): boolean => {
    microphoneTrack.enabled = !microphoneTrack.enabled;
    return !microphoneTrack.enabled;
  };

  const setInputDevice = async (deviceId: string | null): Promise<MediaStreamTrack> => {
    const nextMicStream = await requestMicrophoneStream(deviceId);
    const [nextMicrophoneTrack] = nextMicStream.getAudioTracks();

    if (!nextMicrophoneTrack) {
      throw new Error("Microphone track is unavailable");
    }

    const nextSource = audioContext.createMediaStreamSource(nextMicStream);
    const nextProcessor = await options.noiseSuppressor.createProcessorNode(audioContext, nextSource);
    nextProcessor.connect(destinationNode);

    processorNode.disconnect();
    sourceNode.disconnect();

    for (const track of microphoneStream.getTracks()) {
      track.stop();
    }

    microphoneStream = nextMicStream;
    microphoneTrack = nextMicrophoneTrack;
    sourceNode = nextSource;
    processorNode = nextProcessor;

    return outgoingTrack;
  };

  const dispose = (): void => {
    processorNode.disconnect();
    sourceNode.disconnect();

    for (const track of microphoneStream.getTracks()) {
      track.stop();
    }

    for (const track of destinationNode.stream.getTracks()) {
      track.stop();
    }

    void audioContext.close();
  };

  return {
    stream: destinationNode.stream,
    outgoingTrack,
    isMuted,
    toggleMute,
    setInputDevice,
    monitorSpeaking: (onSpeakingChange) => createMonitor(audioContext, microphoneStream, onSpeakingChange),
    dispose
  };
};

export const monitorRemoteAudio = (
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void
): AudioMonitorStop => {
  const audioContext = new AudioContext();
  const stop = createMonitor(audioContext, stream, onSpeakingChange);

  return () => {
    stop();
    void audioContext.close();
  };
};
