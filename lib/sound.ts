'use client';

/** Opt-in WebAudio sound design — synth only, no static assets. Every public
 * method is a no-op unless `enable()` has been called (checked internally),
 * so callers never need to branch on `sound.enabled` themselves. */
class SoundFx {
  enabled = false;
  private ctx: AudioContext | null = null;
  private crowd: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  enable() {
    this.enabled = true;
    this.ctx ??= new AudioContext();
    this.startCrowd();
  }
  disable() {
    this.enabled = false;
    this.stopCrowd();
  }

  /** A short filtered-noise buffer used as the raw material for both the
   * ambient crowd loop and the finale swell — cheap to synthesize, no
   * network asset. */
  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Low-volume looping crowd murmur — band-passed noise, started on
   * `enable()` and torn down on `disable()` so the toggle fully mutes. */
  private startCrowd() {
    if (!this.enabled || !this.ctx || this.crowd) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, 2);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.015;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    this.crowd = { source, gain };
  }
  private stopCrowd() {
    if (!this.crowd) return;
    try {
      this.crowd.source.stop();
    } catch {
      // already stopped — nothing to do
    }
    this.crowd.source.disconnect();
    this.crowd.gain.disconnect();
    this.crowd = null;
  }

  private tone(freq: number, durMs: number, type: OscillatorType, gainV = 0.08) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainV, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + durMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + durMs / 1000);
  }

  /** Turn/run start. */
  whistle() {
    this.tone(2200, 350, 'square', 0.05);
  }
  /** Elimination lock. */
  horn() {
    this.tone(220, 900, 'sawtooth', 0.1);
    this.tone(277, 900, 'sawtooth', 0.06);
  }
  /** Subtle pick-lock chime (non-elimination locks, e.g. the finale's
   * pick-#2 lock). */
  lock() {
    this.tone(880, 150, 'triangle', 0.09);
  }
  /** Stat-reveal blip at a turn's ~70% mark. */
  pop() {
    this.tone(1400, 90, 'sine', 0.07);
  }
  /** Finale crowd swell — a gain ramp up and back down over the reveal of
   * the champion, layered under the existing confetti horn. */
  swell() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, 3);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.01, t0);
    gain.gain.linearRampToValueAtTime(0.14, t0 + 1.2);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + 3);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    source.stop(t0 + 3);
  }
}

export const sound = new SoundFx();
