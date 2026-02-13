// RNNoise-based Web Audio processor for denoising microphone input frames.
import { Rnnoise } from "@shiguredo/rnnoise-wasm";
const RNNOISE_SAMPLE_RATE = 48_000;
const resampleLinear = (input, fromRate, toRate) => {
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
const dequeueToLength = (queue, length) => {
    const size = Math.min(length, queue.length);
    const output = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
        output[i] = queue[i] ?? 0;
    }
    queue.splice(0, size);
    return output;
};
const clampLength = (input, length) => {
    if (input.length === length) {
        return input;
    }
    const output = new Float32Array(length);
    output.set(input.subarray(0, Math.min(input.length, length)));
    return output;
};
export class NoiseSuppressor {
    rnnoise = null;
    denoiseState = null;
    enabled = true;
    lastVadProbability = 1;
    async init() {
        try {
            this.rnnoise = await Rnnoise.load();
            this.denoiseState = this.rnnoise.createDenoiseState();
            console.log("[rnnoise] Loaded RNNoise WASM", { frameSize: this.rnnoise.frameSize });
        }
        catch (error) {
            this.rnnoise = null;
            this.denoiseState = null;
            this.lastVadProbability = 1;
            console.log("[rnnoise] Failed to load RNNoise, falling back to passthrough", {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    createProcessorNode(audioContext, sourceNode) {
        if (!this.rnnoise || !this.denoiseState) {
            const passthrough = audioContext.createGain();
            sourceNode.connect(passthrough);
            return passthrough;
        }
        const frameSize = this.rnnoise.frameSize;
        const scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);
        const inputQueue48k = [];
        const outputQueue48k = [];
        scriptProcessor.onaudioprocess = (event) => {
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
            const outputAtContextRate = clampLength(resampleLinear(processed48k, RNNOISE_SAMPLE_RATE, audioContext.sampleRate), output.length);
            output.set(outputAtContextRate);
        };
        sourceNode.connect(scriptProcessor);
        return scriptProcessor;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log("[rnnoise] Noise suppression toggled", { enabled: this.enabled });
    }
    isEnabled() {
        return this.enabled;
    }
    getVadProbability() {
        return this.lastVadProbability;
    }
    destroy() {
        if (this.denoiseState) {
            this.denoiseState.destroy();
            this.denoiseState = null;
        }
        this.rnnoise = null;
        console.log("[rnnoise] Destroyed RNNoise state");
    }
}
