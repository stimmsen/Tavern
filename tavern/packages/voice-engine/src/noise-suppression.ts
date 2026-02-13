// RNNoise audio pipeline with AudioWorklet primary path and ScriptProcessor fallback.

import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const RNNOISE_SAMPLE_RATE = 48_000;
const VAD_POLL_INTERVAL_MS = 20;

const resampleLinear = (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (fromRate === toRate || input.length === 0) {
    return new Float32Array(input);
  }

  const ratio = toRate / fromRate;
  const outputLength = Math.max(1, Math.round(input.length * ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i / ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const mix = sourceIndex - leftIndex;

    output[i] = input[leftIndex] * (1 - mix) + input[rightIndex] * mix;
  }

  return output;
};

const dequeueToLength = (queue: number[], length: number): Float32Array => {
  const size = Math.min(length, queue.length);
  const output = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    output[i] = queue[i] ?? 0;
  }

  queue.splice(0, size);
  return output;
};

const clampLength = (input: Float32Array, length: number): Float32Array => {
  if (input.length === length) {
    return input;
  }

  const output = new Float32Array(length);
  output.set(input.subarray(0, Math.min(input.length, length)));
  return output;
};

export class NoiseSuppressor {
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;
  private enabled = true;
  private mobileDevice = false;
  private vadAvailable = true;
  private lastVadProbability = 1;
  private workletNode: AudioWorkletNode | null = null;
  private vadPollHandle: number | null = null;

  public async init(): Promise<void> {
    this.mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (this.mobileDevice) {
      this.enabled = false;
      this.vadAvailable = false;
      this.lastVadProbability = 1;
      console.log("[rnnoise] Mobile device detected — skipping noise suppression");
      return;
    }

    this.vadAvailable = true;
    console.log("[rnnoise] Initialized noise suppressor for desktop browser");
  }

  public async createProcessorNode(
    audioContext: AudioContext,
    sourceNode: MediaStreamAudioSourceNode
  ): Promise<AudioNode> {
    if (this.mobileDevice) {
      const passthrough = audioContext.createGain();
      sourceNode.connect(passthrough);
      return passthrough;
    }

    if (audioContext.audioWorklet) {
      try {
        await audioContext.audioWorklet.addModule("rnnoise-worklet-processor.js");
        const workletNode = new AudioWorkletNode(audioContext, "rnnoise-worklet-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1]
        });

        await this.initializeWorklet(workletNode);

        this.workletNode = workletNode;
        this.startVadPolling(workletNode);
        sourceNode.connect(workletNode);
        workletNode.port.postMessage({ type: "set-enabled", data: this.enabled });
        console.log("[rnnoise] AudioWorklet processor initialized");
        return workletNode;
      } catch (error) {
        console.log("[rnnoise] AudioWorklet init failed — using ScriptProcessorNode fallback", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      console.warn("[rnnoise] AudioWorklet not supported — using ScriptProcessorNode fallback");
    }

    return this.createLegacyScriptProcessorNode(audioContext, sourceNode);
  }

  public setEnabled(enabled: boolean): void {
    if (this.mobileDevice) {
      this.enabled = false;
      return;
    }

    this.enabled = enabled;

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "set-enabled", data: enabled });
    }

    console.log("[rnnoise] Noise suppression toggled", { enabled: this.enabled });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isMobile(): boolean {
    return this.mobileDevice;
  }

  public isVadAvailable(): boolean {
    return this.vadAvailable;
  }

  public getVadProbability(): number {
    return this.lastVadProbability;
  }

  public destroy(): void {
    if (this.vadPollHandle !== null) {
      window.clearInterval(this.vadPollHandle);
      this.vadPollHandle = null;
    }

    if (this.denoiseState) {
      this.denoiseState.destroy();
      this.denoiseState = null;
    }

    this.rnnoise = null;
    this.workletNode = null;
    console.log("[rnnoise] Destroyed RNNoise state");
  }

  private async initializeWorklet(workletNode: AudioWorkletNode): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Worklet init timeout"));
      }, 5000);

      workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
        const payload = event.data;

        if (typeof payload !== "object" || payload === null) {
          return;
        }

        const message = payload as { type?: string; data?: unknown };

        if (message.type === "init-complete") {
          window.clearTimeout(timeoutId);
          resolve();
          return;
        }

        if (message.type === "init-error") {
          window.clearTimeout(timeoutId);
          reject(new Error(typeof message.data === "string" ? message.data : "Unknown init error"));
        }
      };

      workletNode.port.postMessage({ type: "init-wasm" });
    });
  }

  private startVadPolling(workletNode: AudioWorkletNode): void {
    if (this.vadPollHandle !== null) {
      window.clearInterval(this.vadPollHandle);
    }

    workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;

      if (typeof payload !== "object" || payload === null) {
        return;
      }

      const message = payload as { type?: string; data?: unknown };

      if (message.type === "vad-probability" && typeof message.data === "number") {
        this.lastVadProbability = Math.max(0, Math.min(1, message.data));
      }
    };

    this.vadPollHandle = window.setInterval(() => {
      workletNode.port.postMessage({ type: "get-vad" });
    }, VAD_POLL_INTERVAL_MS);
  }

  private async ensureMainThreadRnnoise(): Promise<void> {
    if (this.rnnoise && this.denoiseState) {
      return;
    }

    this.rnnoise = await Rnnoise.load();
    this.denoiseState = this.rnnoise.createDenoiseState();
    console.log("[rnnoise] Loaded RNNoise for ScriptProcessor fallback", {
      frameSize: this.rnnoise.frameSize
    });
  }

  private async createLegacyScriptProcessorNode(
    audioContext: AudioContext,
    sourceNode: MediaStreamAudioSourceNode
  ): Promise<AudioNode> {
    try {
      await this.ensureMainThreadRnnoise();
    } catch (error) {
      this.vadAvailable = false;
      this.enabled = false;
      this.lastVadProbability = 1;
      console.log("[rnnoise] Legacy RNNoise init failed, using passthrough", {
        error: error instanceof Error ? error.message : String(error)
      });

      const passthrough = audioContext.createGain();
      sourceNode.connect(passthrough);
      return passthrough;
    }

    if (!this.rnnoise || !this.denoiseState) {
      const passthrough = audioContext.createGain();
      sourceNode.connect(passthrough);
      return passthrough;
    }

    const frameSize = this.rnnoise.frameSize;
    const scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);
    const inputQueue48k: number[] = [];
    const outputQueue48k: number[] = [];

    scriptProcessor.onaudioprocess = (event): void => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);

      if (!this.enabled || !this.denoiseState) {
        output.set(input);
        this.lastVadProbability = 1;
        return;
      }

      const input48k = resampleLinear(input, audioContext.sampleRate, RNNOISE_SAMPLE_RATE);

      for (const sample of input48k) {
        inputQueue48k.push(sample);
      }

      while (inputQueue48k.length >= frameSize) {
        const frame = dequeueToLength(inputQueue48k, frameSize);
        this.lastVadProbability = this.denoiseState.processFrame(frame);

        for (const sample of frame) {
          outputQueue48k.push(sample);
        }
      }

      const processed48k = clampLength(dequeueToLength(outputQueue48k, input48k.length), input48k.length);

      if (processed48k.length < input48k.length) {
        for (let i = processed48k.length; i < input48k.length; i += 1) {
          processed48k[i] = input48k[i] ?? 0;
        }
      }

      const outputAtContextRate = clampLength(
        resampleLinear(processed48k, RNNOISE_SAMPLE_RATE, audioContext.sampleRate),
        output.length
      );

      output.set(outputAtContextRate);
    };

    sourceNode.connect(scriptProcessor);
    return scriptProcessor;
  }
}
