// Audio utilities for mic capture, local monitoring, mute control, and processed output.
const LEVEL_THRESHOLD = 0.06;
const createMonitor = (audioContext, stream, onSpeakingChange) => {
    const monitorSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    monitorSource.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let isSpeaking = false;
    let rafId = 0;
    const tick = () => {
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
export const createLocalAudioController = async (options) => {
    const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [microphoneTrack] = microphoneStream.getAudioTracks();
    if (!microphoneTrack) {
        throw new Error("Microphone track is unavailable");
    }
    const audioContext = new AudioContext({ sampleRate: 48_000 });
    const sourceNode = audioContext.createMediaStreamSource(microphoneStream);
    const processorNode = options.noiseSuppressor.createProcessorNode(audioContext, sourceNode);
    const destinationNode = audioContext.createMediaStreamDestination();
    processorNode.connect(destinationNode);
    const outgoingTrack = destinationNode.stream.getAudioTracks()[0];
    if (!outgoingTrack) {
        throw new Error("Processed outgoing track is unavailable");
    }
    const isMuted = () => {
        return !microphoneTrack.enabled;
    };
    const toggleMute = () => {
        microphoneTrack.enabled = !microphoneTrack.enabled;
        return !microphoneTrack.enabled;
    };
    const dispose = () => {
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
        monitorSpeaking: (onSpeakingChange) => createMonitor(audioContext, microphoneStream, onSpeakingChange),
        dispose
    };
};
export const monitorRemoteAudio = (stream, onSpeakingChange) => {
    const audioContext = new AudioContext();
    const stop = createMonitor(audioContext, stream, onSpeakingChange);
    return () => {
        stop();
        void audioContext.close();
    };
};
