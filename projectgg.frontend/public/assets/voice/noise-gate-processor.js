/**
 * Noise Gate AudioWorklet Processor
 * Runs on the audio rendering thread — zero main-thread overhead.
 *
 * Features:
 *  - Adaptive noise floor estimation (EMA) — only tracks DOWN when closed
 *  - Hysteresis: open at openThresh * noiseFloor, close at closeThresh * noiseFloor
 *  - Smooth gain ramps (attack ~15ms, release ~5ms) — no clicks/pops
 *  - Hangover: keeps gate open briefly after signal drops, prevents choppy cutoffs
 *  - Bypass: pass-through when disabled
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.noiseFloor = 0.02;
    this.closedAlpha = 0.98;
    this.openAlpha = 0.997;
    this.noiseFloorMax = 0.15;

    this.openMultiplier = 1.6;
    this.closeMultiplier = 1.1;

    this.attackCoeff = 0.25;
    this.releaseCoeff = 0.12;

    this.currentGain = 0;
    this.targetGain = 0;
    this.isOpen = false;

    this.hangoverFrames = 35;
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

    // Only track noise floor DOWNWARD when gate is closed — never let speech raise it
    if (!this.isOpen) {
      if (rms < this.noiseFloor) {
        this.noiseFloor = this.noiseFloor * this.closedAlpha + rms * (1 - this.closedAlpha);
      }
    } else {
      // When open, very slow tracking to gently adjust
      if (rms < this.noiseFloor * 1.2) {
        this.noiseFloor = this.noiseFloor * this.openAlpha + rms * (1 - this.openAlpha);
      }
    }
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
