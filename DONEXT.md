# Sprint 2.2 Patch — AudioWorklet Migration

**Context:** Sprint 2.2 deliverables (Opus config, RNNoise noise suppression, VAD, PTT) are all working. However, the RNNoise integration uses `ScriptProcessorNode`, which processes audio on the main thread. This causes crackling/clipping artifacts under load and triggers a Chrome deprecation warning. Mobile devices experience total mute when noise suppression is enabled (likely due to `AudioContext` suspension and sample rate mismatches).

**Goal:** Replace `ScriptProcessorNode` with `AudioWorkletNode` for RNNoise processing. This moves audio processing off the main thread, eliminating crackling. Additionally, add mobile detection to gracefully skip noise suppression on mobile browsers.

---

## Deliverable 1 — RNNoise AudioWorklet Processor

**Files:**

```
packages/voice-engine/src/rnnoise-worklet-processor.ts   # NEW — runs in AudioWorkletGlobalScope
packages/voice-engine/src/noise-suppression.ts            # MODIFY — swap ScriptProcessorNode → AudioWorkletNode
```

### Step 1: Create the AudioWorklet Processor

Create `packages/voice-engine/src/rnnoise-worklet-processor.ts`

This file runs inside `AudioWorkletGlobalScope` (a separate thread). It does NOT have access to the DOM, `window`, or main-thread globals.

**Implementation:**

```tsx
// rnnoise-worklet-processor.ts
// This file is registered via audioContext.audioWorklet.addModule()

class RnnoiseWorkletProcessor extends AudioWorkletProcessor {
  // WASM instance and state
  private rnnoiseModule: any = null;
  private rnnoiseState: any = null;
  private inputBuffer: Float32Array;
  private outputBuffer: Float32Array;
  private bufferIndex: number = 0;
  private enabled: boolean = true;
  private vadProbability: number = 0;

  static get parameterDescriptors() {
    return [];
  }

  constructor() {
    super();
    this.inputBuffer = new Float32Array(480);  // RNNoise frame size
    this.outputBuffer = new Float32Array(480);
    
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      switch (type) {
        case 'init-wasm':
          // Receive the WASM module transferred from main thread
          this.initWasm(data);
          break;
        case 'set-enabled':
          this.enabled = data;
          break;
        case 'get-vad':
          this.port.postMessage({ type: 'vad-probability', data: this.vadProbability });
          break;
      }
    };
  }

  private async initWasm(wasmData: any) {
    // Initialize RNNoise from the transferred WASM module/bytes
    // Implementation depends on how @shiguredo/rnnoise-wasm exposes its internals
    // The main thread should extract and transfer whatever is needed
    try {
      // ... init logic here ...
      this.port.postMessage({ type: 'init-complete' });
    } catch (e) {
      this.port.postMessage({ type: 'init-error', data: String(e) });
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    if (!this.enabled || !this.rnnoiseState) {
      // Passthrough — copy input to output unchanged
      outputChannel.set(inputChannel);
      return true;
    }

    // Buffer 128-sample render quanta into 480-sample RNNoise frames
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer[this.bufferIndex] = inputChannel[i] * 32768; // RNNoise expects int16 range
      this.bufferIndex++;

      if (this.bufferIndex === 480) {
        // Process one RNNoise frame
        this.vadProbability = this.rnnoiseProcessFrame(this.inputBuffer, this.outputBuffer);
        
        // Copy denoised output back (scale back to float)
        for (let j = 0; j < 480; j++) {
          this.outputBuffer[j] = this.outputBuffer[j] / 32768;
        }
        
        this.bufferIndex = 0;
      }
    }

    // Output the most recent processed samples
    // NOTE: This is a simplified sketch — actual implementation needs a proper
    // ring buffer to handle the 128→480 frame size mismatch without dropping samples.
    // Use a circular buffer that accumulates input and emits output in lockstep.
    outputChannel.set(inputChannel); // placeholder — replace with ring buffer output

    return true;
  }

  private rnnoiseProcessFrame(input: Float32Array, output: Float32Array): number {
    // Call the actual RNNoise WASM function
    // Returns VAD probability (0.0 to 1.0)
    return 0;
  }
}

registerProcessor('rnnoise-worklet-processor', RnnoiseWorkletProcessor);
```

**Critical implementation details:**

- RNNoise processes 480 samples at a time (10ms at 48kHz)
- `AudioWorkletNode.process()` receives 128 samples per call (one render quantum)
- You MUST implement a **ring buffer** to accumulate 128-sample chunks into 480-sample frames, process them through RNNoise, and output denoised samples in 128-sample chunks
- The ring buffer must handle the 480/128 mismatch cleanly (480 is not evenly divisible by 128 — it takes 3.75 render quanta to fill one RNNoise frame)
- RNNoise expects input scaled to int16 range (-32768 to 32767). Multiply input by 32768 before processing, divide output by 32768 after
- `this.vadProbability` must be accessible to the main thread via `MessagePort` — poll it with `get-vad` messages

### Step 2: Build the worklet processor as a separate file

The AudioWorklet processor must be loaded as a **separate JS file** via `audioContext.audioWorklet.addModule()`. It cannot be part of the main `bundle.js`.

**esbuild configuration:**

Add a second build entry in `package.json` scripts:

```json
"scripts": {
  "build": "esbuild src/index.ts --bundle --outfile=public/bundle.js --format=esm --platform=browser && esbuild src/rnnoise-worklet-processor.ts --bundle --outfile=public/rnnoise-worklet-processor.js --format=esm --platform=browser"
}
```

This produces two files:

- `public/bundle.js` — main app (unchanged)
- `public/rnnoise-worklet-processor.js` — worklet processor (loaded by `addModule()`)

### Step 3: Modify NoiseSuppressor to use AudioWorkletNode

In `packages/voice-engine/src/noise-suppression.ts`:

**Replace** the `createProcessorNode()` method. Instead of creating a `ScriptProcessorNode`, do this:

```tsx
async createProcessorNode(
  audioContext: AudioContext,
  sourceNode: MediaStreamAudioSourceNode
): Promise<AudioNode> {
  // Register the worklet processor
  await audioContext.audioWorklet.addModule('rnnoise-worklet-processor.js');
  
  // Create the worklet node
  const workletNode = new AudioWorkletNode(audioContext, 'rnnoise-worklet-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],  // mono
  });
  
  // Transfer WASM module to the worklet thread
  // Extract whatever @shiguredo/rnnoise-wasm needs and send it via postMessage
  workletNode.port.postMessage({
    type: 'init-wasm',
    data: this.wasmModule  // or bytes, or whatever the package exposes
  });
  
  // Wait for init confirmation
  await new Promise<void>((resolve, reject) => {
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'init-complete') resolve();
      if (event.data.type === 'init-error') reject(new Error(event.data.data));
    };
    setTimeout(() => reject(new Error('Worklet init timeout')), 5000);
  });
  
  // Set up VAD probability polling
  // Replace the old synchronous getVadProbability() with a message-based approach
  this.setupVadPolling(workletNode);
  
  this.workletNode = workletNode;
  
  console.log('[rnnoise] AudioWorklet processor initialized');
  return workletNode;
}
```

**Update `setEnabled()`** to send a message to the worklet:

```tsx
setEnabled(enabled: boolean): void {
  this._enabled = enabled;
  if (this.workletNode) {
    this.workletNode.port.postMessage({ type: 'set-enabled', data: enabled });
  }
  console.log('[rnnoise] Noise suppression toggled', { enabled });
}
```

**Update `getVadProbability()`** to use the polled value from MessagePort:

```tsx
private setupVadPolling(workletNode: AudioWorkletNode): void {
  // Poll VAD probability from the worklet every 20ms
  this.vadPollInterval = setInterval(() => {
    workletNode.port.postMessage({ type: 'get-vad' });
  }, 20);
  
  workletNode.port.onmessage = (event) => {
    if (event.data.type === 'vad-probability') {
      this._vadProbability = event.data.data;
    }
  };
}

getVadProbability(): number {
  return this._vadProbability;
}
```

---

## Deliverable 2 — Mobile Graceful Fallback

**File:** `packages/voice-engine/src/noise-suppression.ts` (same file)

**What to build:**

Add mobile detection and skip the RNNoise pipeline entirely on mobile devices. This prevents the total-mute bug.

**Implementation:**

```tsx
private isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
```

In `createProcessorNode()`, add an early return:

```tsx
if (this.isMobile()) {
  console.log('[rnnoise] Mobile device detected — skipping noise suppression');
  this._enabled = false;
  // Return a passthrough GainNode so the audio chain stays intact
  const passthrough = audioContext.createGain();
  passthrough.gain.value = 1.0;
  return passthrough;
}
```

**UI update:**

- On mobile, the noise suppression toggle button should show "🔇 Noise Suppression: N/A (mobile)" and be disabled/grayed out
- The VAD should still work on mobile IF it can fall back to a simple volume-threshold approach (no RNNoise dependency). If that's too complex, disable VAD on mobile too and just leave the mic always hot.

---

## File Structure Summary

```
packages/voice-engine/
├── src/
│   ├── rnnoise-worklet-processor.ts  # NEW — AudioWorklet processor (separate thread)
│   ├── noise-suppression.ts          # MODIFIED — uses AudioWorkletNode instead of ScriptProcessorNode
│   ├── opus-config.ts                # unchanged
│   ├── vad.ts                        # unchanged (reads VAD from NoiseSuppressor as before)
│   ├── ptt.ts                        # unchanged
│   └── index.ts                      # entry point (unchanged)
├── public/
│   ├── bundle.js                     # main app bundle (rebuilt)
│   └── rnnoise-worklet-processor.js  # NEW — worklet bundle (separate esbuild output)
└── index.html                        # unchanged
```

---

## Global Rules

- **Do NOT modify the signaling server** — this patch only touches `packages/voice-engine/`
- **Do NOT modify `packages/shared/`**
- **Do NOT break existing functionality** — Opus config, VAD, and PTT must all still work after this change
- **Fallback required** — if `audioContext.audioWorklet` is not supported (very old browsers), fall back to the existing `ScriptProcessorNode` implementation. Do not remove the old code, just wrap it in a feature-detection branch:
    
    ```tsx
    if (audioContext.audioWorklet) {
      // Use AudioWorkletNode (new path)
    } else {
      // Use ScriptProcessorNode (legacy fallback)
      console.warn('[rnnoise] AudioWorklet not supported — using ScriptProcessorNode fallback');
    }
    ```
    
- **TypeScript only**, strict types, no `any`
- **Console logging** — prefix with `[rnnoise]` as before
- **Two esbuild outputs** — `bundle.js` (main) and `rnnoise-worklet-processor.js` (worklet). Both must be built by `npm run build`.

---

## WASM Transfer Strategy

The trickiest part of this migration is getting the RNNoise WASM into the worklet thread. `@shiguredo/rnnoise-wasm` appears to be self-contained JS (no separate `.wasm` file). Options for getting it into the worklet:

**Option A (preferred):** Import `@shiguredo/rnnoise-wasm` directly in the worklet processor file. Since we're bundling it with esbuild as a separate entry, the WASM internals will be inlined. This is the simplest approach — just `import` it at the top of `rnnoise-worklet-processor.ts` and use it directly in the worklet.

**Option B:** If Option A fails (some WASM packages use `fetch()` or DOM APIs that don't exist in `AudioWorkletGlobalScope`), then:

1. Load the WASM module on the main thread
2. Extract the compiled `WebAssembly.Module` object
3. Transfer it to the worklet via `postMessage(data, [transfer])`
4. Instantiate it in the worklet with `WebAssembly.instantiate(module, imports)`

**Try Option A first.** If the esbuild bundle for the worklet works and RNNoise initializes inside `AudioWorkletGlobalScope`, you're done. If it throws errors about missing APIs (`fetch`, `document`, etc.), switch to Option B.

---

## Verification Steps

1. **No more crackling** — connect two desktop browser tabs, talk, and verify the audio is clean with noise suppression ON. No more clipping artifacts.
2. **Deprecation warning gone** — check the console. The `ScriptProcessorNode is deprecated` warning should no longer appear (unless the legacy fallback is triggered).
3. **VAD still works** — stop talking, verify the "Silent" indicator appears and outgoing bytes drop in `webrtc-internals`.
4. **PTT still works** — enable PTT, hold backtick, verify audio flows. Release, verify mute.
5. **Opus config still applied** — check `webrtc-internals` for the SDP params (`maxaveragebitrate=64000`, etc.).
6. **Mobile fallback** — open on a phone. Noise suppression should be auto-disabled and the mic should work without muting. The toggle should show "N/A (mobile)".
7. **Legacy fallback** — if you can test on an older browser without AudioWorklet support, verify it falls back to ScriptProcessorNode gracefully.

---

## Out of Scope

- ❌ Any changes to the signaling server
- ❌ TURN / coturn setup
- ❌ Encryption / identity (Sprint 3)
- ❌ Multi-channel / rooms (Sprint 4)
- ❌ Volume-threshold VAD fallback for mobile (nice-to-have, not required)
- ❌ Sample rate resampling for mobile mic inputs (future patch if needed)