import { HeatLevel, QteGrade } from '../types';

class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private bgmEl: HTMLAudioElement | null = null;
  private flameGain: GainNode | null = null;
  private flameFilter: BiquadFilterNode | null = null;
  private flameSource: AudioBufferSourceNode | null = null;
  private muted = false;
  private bgmVolume = 0.45;
  private sfxVolume = 0.65;
  private bgmStarted = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public initBgm() {
    if (typeof window === 'undefined') return;
    if (!this.bgmEl) {
      const base = import.meta.env.BASE_URL || '/';
      this.bgmEl = new Audio(`${base}assets/audio/BGM08.ogg`);
      this.bgmEl.loop = true;
      this.bgmEl.volume = this.muted ? 0 : this.bgmVolume;
    }
    if (!this.bgmStarted) {
      this.bgmEl
        .play()
        .then(() => {
          this.bgmStarted = true;
        })
        .catch(() => {
          // Will unlock on next pointer/key interaction
        });
    }
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.bgmEl) {
      this.bgmEl.volume = m ? 0 : this.bgmVolume;
    }
    if (this.flameGain && this.ctx) {
      this.flameGain.gain.setTargetAtTime(m ? 0 : this.currentFlameVol, this.ctx.currentTime, 0.08);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setBgmVolume(v: number) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmEl && !this.muted) {
      this.bgmEl.volume = this.bgmVolume;
    }
  }

  public getBgmVolume(): number {
    return this.bgmVolume;
  }

  private currentFlameVol = 0;

  public updateFlameAmbience(heat: HeatLevel, active: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.flameSource && active && heat > 0) {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // brownian/pinkish gas roar
        data[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = data[i];
        data[i] *= 3.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();

      this.flameSource = src;
      this.flameFilter = filter;
      this.flameGain = gain;
    }

    const targetVol = active && heat > 0 ? (0.04 + heat * 0.028) * this.sfxVolume : 0;
    this.currentFlameVol = targetVol;
    if (this.flameGain && this.flameFilter) {
      this.flameGain.gain.setTargetAtTime(this.muted ? 0 : targetVol, ctx.currentTime, 0.12);
      this.flameFilter.frequency.setTargetAtTime(220 + heat * 110, ctx.currentTime, 0.12);
    }
  }

  public stopFlameAmbience() {
    this.updateFlameAmbience(0, false);
  }

  public playClick() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.055);
    gain.gain.setValueAtTime(0.14 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }

  public playIgnite() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 2 spark clicks
    [0, 0.09].forEach((offset) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1900, now + offset);
      osc.frequency.exponentialRampToValueAtTime(300, now + offset + 0.025);
      g.gain.setValueAtTime(0.16 * this.sfxVolume, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.03);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.035);
    });

    // Gas whoosh
    const len = Math.floor(ctx.sampleRate * 0.32);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(900, now + 0.14);
    flt.frequency.exponentialRampToValueAtTime(220, now + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28 * this.sfxVolume, now + 0.14);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    src.connect(flt);
    flt.connect(g);
    g.connect(ctx.destination);
    src.start(now + 0.14);
  }

  public playSizzle(intensity = 0.7) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.35 + intensity * 0.35;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 1.4);
      const crackle = Math.random() > 0.96 ? 1.8 : 0.7;
      ch[i] = (Math.random() * 2 - 1) * env * crackle;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22 * intensity * this.sfxVolume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  public playSeasoning(liquid: boolean) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (liquid) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.16);
      g.gain.setValueAtTime(0.18 * this.sfxVolume, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    } else {
      // sprinkle ticks
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1600 + i * 240, now + i * 0.035);
        g.gain.setValueAtTime(0.09 * this.sfxVolume, now + i * 0.035);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + 0.03);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.035);
        osc.stop(now + i * 0.035 + 0.035);
      }
    }
  }

  public playTossQte(grade: QteGrade) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Swish noise
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + 0.18);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * this.sfxVolume, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    src.start(now);

    // Musical chime feedback
    const notes: Record<QteGrade, number[]> = {
      Excellent: [587.33, 880, 1174.66],
      Great: [523.25, 783.99],
      Good: [440],
      Bad: [220, 175],
    };
    const seq = notes[grade];
    seq.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = grade === 'Bad' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      g.gain.setValueAtTime((grade === 'Bad' ? 0.11 : 0.16) * this.sfxVolume, now + idx * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.24);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.25);
    });
  }

  public playFinish(good: boolean) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = good ? [523.25, 659.25, 783.99, 1046.5] : [349.23, 311.13, 277.18];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = good ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      g.gain.setValueAtTime((good ? 0.18 : 0.1) * this.sfxVolume, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.45);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.48);
    });
  }
}

export const audioEngine = new GameAudioEngine();
