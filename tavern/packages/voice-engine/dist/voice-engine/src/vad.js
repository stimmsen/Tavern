// Voice activity detector that gates outgoing audio based on RNNoise VAD scores.
const POLL_INTERVAL_MS = 20;
export class VoiceActivityDetector {
    noiseSuppressor;
    threshold;
    enabled = true;
    voiceActive = true;
    belowThresholdChecks = 0;
    pollHandle = null;
    outgoingTrack = null;
    constructor(noiseSuppressor, options) {
        this.noiseSuppressor = noiseSuppressor;
        this.threshold = options?.threshold ?? 0.5;
    }
    setThreshold(threshold) {
        this.threshold = Math.max(0, Math.min(1, threshold));
        console.log("[vad] Threshold updated", { threshold: this.threshold });
    }
    isVoiceActive() {
        return this.voiceActive;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log("[vad] VAD toggled", { enabled: this.enabled });
        if (!this.enabled) {
            this.voiceActive = true;
            this.belowThresholdChecks = 0;
            if (this.outgoingTrack) {
                this.outgoingTrack.enabled = true;
            }
        }
    }
    isEnabled() {
        return this.enabled;
    }
    start(outgoingTrack) {
        this.stop();
        this.outgoingTrack = outgoingTrack;
        console.log("[vad] Started VAD polling");
        this.pollHandle = window.setInterval(() => {
            if (!this.outgoingTrack || !this.enabled) {
                return;
            }
            const probability = this.noiseSuppressor.getVadProbability();
            if (probability < this.threshold) {
                this.belowThresholdChecks += 1;
                if (this.belowThresholdChecks >= 3) {
                    this.outgoingTrack.enabled = false;
                    this.voiceActive = false;
                }
            }
            else {
                this.belowThresholdChecks = 0;
                this.outgoingTrack.enabled = true;
                this.voiceActive = true;
            }
        }, POLL_INTERVAL_MS);
    }
    stop() {
        if (this.pollHandle !== null) {
            window.clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
        this.belowThresholdChecks = 0;
        this.voiceActive = true;
        if (this.outgoingTrack) {
            this.outgoingTrack.enabled = true;
        }
        this.outgoingTrack = null;
        console.log("[vad] Stopped VAD polling");
    }
}
