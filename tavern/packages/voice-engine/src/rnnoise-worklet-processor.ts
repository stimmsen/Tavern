// AudioWorklet processor that runs RNNoise denoising off the main thread.

import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const RNNOISE_FRAME_SIZE = 480;
const INT16_SCALE = 32768;

interface WorkletAudioParamDescriptor {
  name: string;
  automationRate?: "a-rate" | "k-rate";
  minValue?: number;
  maxValue?: number;
  defaultValue?: number;
}

interface WorkletAudioProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

declare const AudioWorkletProcessor: {
  prototype: WorkletAudioProcessor;
  new (): WorkletAudioProcessor;
};

declare function registerProcessor(
  name: string,
  processorCtor: new () => WorkletAudioProcessor
): void;

type InboundMessage =
  | { type: "init-wasm" }
  | { type: "set-enabled"; data: boolean }
  | { type: "get-vad" };

class FloatRingBuffer {
  private readonly buffer: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private length = 0;

  public constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  public availableRead(): number {
    return this.length;
  }

  public availableWrite(): number {
    return this.buffer.length - this.length;
  }

  public push(value: number): boolean {
    if (this.length >= this.buffer.length) {
      return false;
    }

    this.buffer[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    this.length += 1;
    return true;
  }

  public pop(): number {
    if (this.length === 0) {
      return 0;
    }

    const value = this.buffer[this.readIndex] ?? 0;
    this.readIndex = (this.readIndex + 1) % this.buffer.length;
    this.length -= 1;
    return value;
  }

  public clear(): void {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.length = 0;
  }
}

class RnnoiseWorkletProcessor extends AudioWorkletProcessor {
  private rnnoiseState: DenoiseState | null = null;
  private inputFrame = new Float32Array(RNNOISE_FRAME_SIZE);
  private outputFrame = new Float32Array(RNNOISE_FRAME_SIZE);
  private readonly inputBuffer = new FloatRingBuffer(16_384);
  private readonly outputBuffer = new FloatRingBuffer(16_384);
  private enabled = true;
  private vadProbability = 1;

  public static get parameterDescriptors(): WorkletAudioParamDescriptor[] {
    return [];
  }

  public constructor() {
    super();

    this.port.onmessage = (event: MessageEvent<InboundMessage>) => {
      const message = event.data;

      if (message.type === "init-wasm") {
        void this.initWasm();
        return;
      }

      if (message.type === "set-enabled") {
        this.enabled = message.data;
        return;
      }

      this.port.postMessage({ type: "vad-probability", data: this.vadProbability });
    };
  }

  private async initWasm(): Promise<void> {
    try {
      const rnnoise = await Rnnoise.load();
      this.rnnoiseState = rnnoise.createDenoiseState();
      this.port.postMessage({ type: "init-complete" });
    } catch (error) {
      this.port.postMessage({
        type: "init-error",
        data: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input || !output) {
      return true;
    }

    if (!this.enabled || !this.rnnoiseState) {
      output.set(input);
      this.vadProbability = 1;
      this.inputBuffer.clear();
      this.outputBuffer.clear();
      return true;
    }

    for (let i = 0; i < input.length; i += 1) {
      const pushed = this.inputBuffer.push((input[i] ?? 0) * INT16_SCALE);
      if (!pushed) {
        this.inputBuffer.pop();
        this.inputBuffer.push((input[i] ?? 0) * INT16_SCALE);
      }
    }

    while (
      this.inputBuffer.availableRead() >= RNNOISE_FRAME_SIZE &&
      this.outputBuffer.availableWrite() >= RNNOISE_FRAME_SIZE
    ) {
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i += 1) {
        this.inputFrame[i] = this.inputBuffer.pop();
      }

      this.outputFrame.set(this.inputFrame);
      this.vadProbability = this.rnnoiseState.processFrame(this.outputFrame);

      for (let i = 0; i < RNNOISE_FRAME_SIZE; i += 1) {
        this.outputBuffer.push((this.outputFrame[i] ?? 0) / INT16_SCALE);
      }
    }

    for (let i = 0; i < output.length; i += 1) {
      if (this.outputBuffer.availableRead() > 0) {
        output[i] = this.outputBuffer.pop();
      } else {
        output[i] = input[i] ?? 0;
      }
    }

    return true;
  }
}

registerProcessor("rnnoise-worklet-processor", RnnoiseWorkletProcessor);
