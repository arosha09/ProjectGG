/**
 * Voice Activity Detection AudioWorklet Processor
 * Runs on the audio rendering thread — zero main-thread overhead.
 *
 * Features:
 *  - RMS energy computation per 128-sample quantum
 *  - Adaptive noise floor tracking (exponential moving average)
 *  - Hysteresis: speak_thresh > noise_floor + offset, stop_thresh < speak_thresh - hysteresis
 *  - Hangover timer prevents choppy cutoffs at end of speech
 *  - Sub-frame latency (128 samples @ 48 kHz ≈ 2.67 ms)
 */
class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer for analysis window (256 samples = ~5.3 ms @ 48 kHz)
    this.bufferSize = 256;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.bufferFilled = false;

    // Noise floor estimation
    this.noiseFloor = 0.001;     // Start very low
    this.noiseAlpha = 0.92;      // Faster adaptation (was 0.98)
    this.noiseFloorMax = 0.03;   // Cap

    // VAD thresholds (relative to noise floor)
    this.speakOffset = 1.8;      // Lower = more sensitive (was 2.5)
    this.hysteresis = 0.5;       // Prevents chatter

    // Hangover (prevents choppy cutoffs)
    this.hangoverFrames = 4;     // ~4 quanta = ~10.7 ms (was 8)
    this.hangoverCounter = 0;

    // State
    this.isSpeaking = false;
    this.frameCount = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'setThresholds') {
        if (e.data.speakOffset !== undefined) this.speakOffset = e.data.speakOffset;
        if (e.data.hysteresis !== undefined) this.hysteresis = e.data.hysteresis;
        if (e.data.hangoverFrames !== undefined) this.hangoverFrames = e.data.hangoverFrames;
        if (e.data.noiseAlpha !== undefined) this.noiseAlpha = e.data.noiseAlpha;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Mono channel

    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex] = samples[i];
      this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
      if (this.bufferIndex === 0) this.bufferFilled = true;
    }

    // Don't make decisions until buffer is filled at least once
    if (!this.bufferFilled) return true;

    this.frameCount++;

    // Compute RMS of the analysis buffer
    let sum = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      sum += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sum / this.bufferSize);

    // Update noise floor (only when not speaking)
    if (!this.isSpeaking) {
      const minRms = Math.min(rms, this.noiseFloor * 1.5);
      this.noiseFloor = this.noiseFloor * this.noiseAlpha + minRms * (1 - this.noiseAlpha);
      this.noiseFloor = Math.min(this.noiseFloor, this.noiseFloorMax);
    }

    // Compute adaptive thresholds
    const speakThreshold = this.noiseFloor * this.speakOffset;
    const stopThreshold = speakThreshold * (1 - this.hysteresis);

    // VAD decision with hysteresis — POST IMMEDIATELY, no batching
    if (!this.isSpeaking) {
      if (rms > speakThreshold) {
        this.isSpeaking = true;
        this.hangoverCounter = this.hangoverFrames;
        this.port.postMessage({ type: 'speaking', value: true });
      }
    } else {
      if (rms > stopThreshold) {
        this.hangoverCounter = this.hangoverFrames;
      } else {
        this.hangoverCounter--;
        if (this.hangoverCounter <= 0) {
          this.isSpeaking = false;
          this.port.postMessage({ type: 'speaking', value: false });
        }
      }
    }

    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);
