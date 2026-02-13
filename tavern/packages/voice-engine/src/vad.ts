// Voice activity detector that gates outgoing audio based on RNNoise VAD scores.

import type { NoiseSuppressor } from "./noise-suppression.js";

const POLL_INTERVAL_MS = 20;

export class VoiceActivityDetector {
  private readonly noiseSuppressor: NoiseSuppressor;
  private threshold: number;
  private enabled = true;
  private voiceActive = true;
  private belowThresholdChecks = 0;
  private pollHandle: number | null = null;
  private outgoingTrack: MediaStreamTrack | null = null;

  public constructor(noiseSuppressor: NoiseSuppressor, options?: { threshold?: number }) {
    this.noiseSuppressor = noiseSuppressor;
    this.threshold = options?.threshold ?? 0.5;
  }

  public setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
    console.log("[vad] Threshold updated", { threshold: this.threshold });
  }

  public isVoiceActive(): boolean {
    return this.voiceActive;
  }

  public setEnabled(enabled: boolean): void {
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

  public isEnabled(): boolean {
    return this.enabled;
  }

  public start(outgoingTrack: MediaStreamTrack): void {
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
      } else {
        this.belowThresholdChecks = 0;
        this.outgoingTrack.enabled = true;
        this.voiceActive = true;
      }
    }, POLL_INTERVAL_MS);
  }

  public stop(): void {
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
