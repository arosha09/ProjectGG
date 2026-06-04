import { Injectable } from '@angular/core';

export interface VoiceFingerprint {
  pitch: { min: number; max: number; avg: number };
  tone: { brightness: number; warmth: number };
  speakingRate: number;
  formants: number[];
}

@Injectable({ providedIn: 'root' })
export class ApexVoiceService {
  private audioContext: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  async extractFingerprint(blob: Blob): Promise<VoiceFingerprint> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = this.getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const pitch = this.extractPitch(channelData, sampleRate);
    const formants = this.extractFormants(channelData, sampleRate);
    const speakingRate = this.extractSpeakingRate(channelData, sampleRate);
    const tone = this.extractTone(channelData, sampleRate);

    return { pitch, tone, speakingRate, formants };
  }

  private extractPitch(data: Float32Array, sampleRate: number): { min: number; max: number; avg: number } {
    const pitches: number[] = [];
    const frameSize = 2048;
    const hopSize = 512;

    for (let i = 0; i <= data.length - frameSize; i += hopSize) {
      const frame = data.slice(i, i + frameSize);
      const pitch = this.autocorrelationPitch(frame, sampleRate);
      if (pitch > 50 && pitch < 1000) {
        pitches.push(pitch);
      }
    }

    if (pitches.length === 0) return { min: 0, max: 0, avg: 0 };

    return {
      min: Math.min(...pitches),
      max: Math.max(...pitches),
      avg: pitches.reduce((a, b) => a + b, 0) / pitches.length,
    };
  }

  private autocorrelationPitch(frame: Float32Array, sampleRate: number): number {
    const size = frame.length;
    const correlations = new Float32Array(size);

    for (let lag = 0; lag < size; lag++) {
      let sum = 0;
      for (let i = 0; i < size - lag; i++) {
        sum += frame[i] * frame[i + lag];
      }
      correlations[lag] = sum;
    }

    let d = 0;
    while (correlations[d] > correlations[d + 1]) {
      d++;
      if (d >= size - 1) return 0;
    }

    let maxPos = d;
    for (let i = d; i < size; i++) {
      if (correlations[i] > correlations[maxPos]) {
        maxPos = i;
      }
    }

    if (maxPos === 0 || correlations[maxPos] < 0.01) return 0;

    const shift = (correlations[maxPos + 1] - correlations[maxPos - 1]) /
      (2 * (correlations[maxPos] - correlations[maxPos + 1]) + 1e-10);

    return sampleRate / (maxPos + shift);
  }

  private extractFormants(data: Float32Array, sampleRate: number): number[] {
    const frameSize = 2048;
    const frame = new Float32Array(frameSize);
    const copyLength = Math.min(data.length, frameSize);
    frame.set(data.slice(0, copyLength));

    for (let i = 0; i < frameSize; i++) {
      frame[i] *= 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (frameSize - 1));
    }

    const fft = this.simpleFFT(frame);
    const magnitude = new Float32Array(fft.length / 2);
    for (let i = 0; i < magnitude.length; i++) {
      magnitude[i] = Math.sqrt(fft[i * 2] ** 2 + fft[i * 2 + 1] ** 2);
    }

    const formants: number[] = [];
    const freqPerBin = sampleRate / frameSize;
    const bands = [
      { start: 200, end: 1000 },
      { start: 1000, end: 2500 },
      { start: 2500, end: 3500 },
    ];

    for (const band of bands) {
      const startBin = Math.floor(band.start / freqPerBin);
      const endBin = Math.min(Math.floor(band.end / freqPerBin), magnitude.length);

      let maxVal = 0;
      let maxBin = startBin;
      for (let i = startBin; i < endBin; i++) {
        if (magnitude[i] > maxVal) {
          maxVal = magnitude[i];
          maxBin = i;
        }
      }

      formants.push(maxBin * freqPerBin);
    }

    return formants;
  }

  private simpleFFT(input: Float32Array): Float32Array {
    const n = input.length;
    const result = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      result[i * 2] = input[i];
      result[i * 2 + 1] = 0;
    }

    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      const j = this.reverseBits(i, bits);
      if (j > i) {
        [result[i * 2], result[j * 2]] = [result[j * 2], result[i * 2]];
        [result[i * 2 + 1], result[j * 2 + 1]] = [result[j * 2 + 1], result[i * 2 + 1]];
      }
    }

    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const angle = -2 * Math.PI / size;
      const wReal = Math.cos(angle);
      const wImag = Math.sin(angle);

      for (let i = 0; i < n; i += size) {
        let curReal = 1;
        let curImag = 0;

        for (let j = 0; j < halfSize; j++) {
          const tReal = curReal * result[(i + j + halfSize) * 2] - curImag * result[(i + j + halfSize) * 2 + 1];
          const tImag = curReal * result[(i + j + halfSize) * 2 + 1] + curImag * result[(i + j + halfSize) * 2];

          result[(i + j + halfSize) * 2] = result[(i + j) * 2] - tReal;
          result[(i + j + halfSize) * 2 + 1] = result[(i + j) * 2 + 1] - tImag;
          result[(i + j) * 2] += tReal;
          result[(i + j) * 2 + 1] += tImag;

          const newReal = curReal * wReal - curImag * wImag;
          curImag = curReal * wImag + curImag * wReal;
          curReal = newReal;
        }
      }
    }

    return result;
  }

  private reverseBits(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (x & 1);
      x >>= 1;
    }
    return result;
  }

  private extractSpeakingRate(data: Float32Array, sampleRate: number): number {
    const threshold = 0.02;
    const windowSize = Math.floor(sampleRate * 0.02);
    let speechFrames = 0;
    let totalFrames = 0;

    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] ** 2;
      }
      energy = Math.sqrt(energy / windowSize);
      totalFrames++;
      if (energy > threshold) speechFrames++;
    }

    return totalFrames > 0 ? speechFrames / totalFrames : 0;
  }

  private extractTone(data: Float32Array, sampleRate: number): { brightness: number; warmth: number } {
    let lowEnergy = 0;
    let highEnergy = 0;
    let totalEnergy = 0;

    const frameSize = 2048;
    const frame = new Float32Array(frameSize);
    const copyLength = Math.min(data.length, frameSize);
    frame.set(data.slice(0, copyLength));

    for (let i = 0; i < frameSize; i++) {
      totalEnergy += frame[i] ** 2;
    }

    const freqPerBin = sampleRate / frameSize;
    const fft = this.simpleFFT(frame);

    for (let i = 0; i < fft.length / 2; i++) {
      const freq = i * freqPerBin;
      const mag = Math.sqrt(fft[i * 2] ** 2 + fft[i * 2 + 1] ** 2) ** 2;
      if (freq < 1000) lowEnergy += mag;
      else highEnergy += mag;
    }

    const total = lowEnergy + highEnergy || 1;
    return {
      brightness: highEnergy / total,
      warmth: lowEnergy / total,
    };
  }

  compareFingerprints(a: VoiceFingerprint, b: VoiceFingerprint): number {
    let totalDistance = 0;
    let dimensions = 0;

    const pitchMinDist = Math.abs(a.pitch.min - b.pitch.min) /
      Math.max(a.pitch.min, b.pitch.min, 1);
    totalDistance += pitchMinDist;
    dimensions++;

    const pitchMaxDist = Math.abs(a.pitch.max - b.pitch.max) /
      Math.max(a.pitch.max, b.pitch.max, 1);
    totalDistance += pitchMaxDist;
    dimensions++;

    const pitchAvgDist = Math.abs(a.pitch.avg - b.pitch.avg) /
      Math.max(a.pitch.avg, b.pitch.avg, 1);
    totalDistance += pitchAvgDist;
    dimensions++;

    const rateDist = Math.abs(a.speakingRate - b.speakingRate) /
      Math.max(a.speakingRate, b.speakingRate, 1);
    totalDistance += rateDist;
    dimensions++;

    const formantCount = Math.min(a.formants.length, b.formants.length);
    for (let i = 0; i < formantCount; i++) {
      const fDist = Math.abs(a.formants[i] - b.formants[i]) /
        Math.max(a.formants[i], b.formants[i], 1);
      totalDistance += fDist;
      dimensions++;
    }

    return dimensions === 0 ? 0 : 1 - totalDistance / dimensions;
  }

  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
