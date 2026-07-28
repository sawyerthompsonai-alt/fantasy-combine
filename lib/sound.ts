'use client';

class SoundFx {
  enabled = false;
  private ctx: AudioContext | null = null;

  enable() {
    this.enabled = true;
    this.ctx ??= new AudioContext();
  }
  disable() {
    this.enabled = false;
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
  whistle() {
    this.tone(2200, 350, 'square', 0.05);
  }
  horn() {
    this.tone(220, 900, 'sawtooth', 0.1);
    this.tone(277, 900, 'sawtooth', 0.06);
  }
  lock() {
    this.tone(880, 150, 'triangle', 0.09);
  }
}

export const sound = new SoundFx();
