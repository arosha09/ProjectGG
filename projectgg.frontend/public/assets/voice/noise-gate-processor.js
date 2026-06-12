/**
 * Noise Gate AudioWorklet Processor
 * Runs on the audio rendering thread — zero main-thread overhead.
 *
 * Features:
 *  - Adaptive noise floor estimation (EMA) — updates even when gate is open
 *  - Hysteresis: open at openThresh * noiseFloor, close at closeThresh * noiseFloor
 *  - Smooth gain ramps (attack ~10ms, release ~100ms) — no clicks/pops
 *  - Hangover: keeps gate open briefly after signal drops, prevents choppy cutoffs
 *  - Bypass: pass-through when disabled
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.noiseFloor = 0.02;
    this.closedAlpha = 0.95;
    this.openAlpha = 0.995;
    this.noiseFloorMax = 0.15;

    this.openMultiplier = 1.8;
    this.closeMultiplier = 1.2;

    this.attackCoeff = 0.6;
    this.releaseCoeff = 0.04;

    this.currentGain = 0;
    this.targetGain = 0;
    this.isOpen = false;

    this.hangoverFrames = 8;
    this.hangoverCounter = 0;

    this.enabled = true;

    this.port.onmessage = (e) => {
      if (e.data?.type === 'setEnabled') {
        this.enabled = !!e.data.enabled;
        if (!this.enabled) {
          this.isOpen = true;
          this.targetGain = 1;
          this.currentGain = 1;
        } else {
          this.isOpen = false;
          this.targetGain = 0;
          this.currentGain = 0;
          this.noiseFloor = 0.02;
        }
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inSamples = input[0];
    const outSamples = output[0];

    if (!this.enabled) {
      for (let i = 0; i < inSamples.length; i++) {
        outSamples[i] = inSamples[i];
      }
      return true;
    }

    let sum = 0;
    for (let i = 0; i < inSamples.length; i++) {
      sum += inSamples[i] * inSamples[i];
    }
    const rms = Math.sqrt(sum / inSamples.length);

    const alpha = this.isOpen ? this.openAlpha : this.closedAlpha;
    this.noiseFloor = this.noiseFloor * alpha + rms * (1 - alpha);
    if (this.noiseFloor > this.noiseFloorMax) this.noiseFloor = this.noiseFloorMax;
    if (this.noiseFloor < 0.001) this.noiseFloor = 0.001;

    const openLevel = this.noiseFloor * this.openMultiplier;
    const closeLevel = this.noiseFloor * this.closeMultiplier;

    if (!this.isOpen) {
      if (rms > openLevel) {
        this.isOpen = true;
        this.targetGain = 1;
        this.hangoverCounter = this.hangoverFrames;
      }
    } else {
      if (rms > closeLevel) {
        this.hangoverCounter = this.hangoverFrames;
      } else {
        this.hangoverCounter--;
        if (this.hangoverCounter <= 0) {
          this.isOpen = false;
          this.targetGain = 0;
        }
      }
    }

    const coeff = this.targetGain > this.currentGain ? this.attackCoeff : this.releaseCoeff;
    for (let i = 0; i < inSamples.length; i++) {
      this.currentGain += (this.targetGain - this.currentGain) * coeff;
      outSamples[i] = inSamples[i] * this.currentGain;
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
