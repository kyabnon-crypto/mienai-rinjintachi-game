import { TRACKS } from './config';
import { Judgment, TrackId } from './types';

// C-major pentatonic / Lydian music-box frequencies (C5 to G6)
const CHIME_SCALE = [
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<TrackId, TrackChannel>> = {};

  public currentTrackId: TrackId = 'dreamy';
  public bgmVolume = 0.72;
  public seVolume = 0.85;
  public timingOffsetMs = 0;
  public isReady = false;

  // Fallback clock if audio element hasn't started progressing yet
  private fallbackTime = 0;

  public unlockOnGesture(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ch = this.channels[this.currentTrackId];
    if (ch && ch.el.paused && this.isReady) {
      void ch.el.play().catch(() => {});
    }
  }

  public init(initialTrack: TrackId): void {
    if (this.ctx) {
      this.unlockOnGesture();
      void this.switchTrack(initialTrack, 0, 0.6);
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    // Kick off resume synchronously inside user gesture (critical for iOS Safari)
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    this.masterBgmGain = this.ctx.createGain();
    this.masterBgmGain.gain.value = this.bgmVolume;

    this.masterSeGain = this.ctx.createGain();
    this.masterSeGain.gain.value = this.seVolume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.masterBgmGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.masterSeGain.connect(this.ctx.destination);

    // Pre-wire all 3 tracks for instantaneous seamless crossfading
    (['dreamy', 'normal', 'remix'] as TrackId[]).forEach((id) => {
      const el = new Audio(TRACKS[id].url);
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.setAttribute('playsinline', '');
      const source = this.ctx!.createMediaElementSource(el);
      const gain = this.ctx!.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.masterBgmGain!);
      this.channels[id] = { el, source, gain };
    });

    this.isReady = true;
    // Start initial track synchronously within the click/tap gesture for mobile Safari
    void this.switchTrack(initialTrack, 0, 0.6);
  }

  public setBgmVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.masterBgmGain && this.ctx) {
      this.masterBgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setSeVolume(v: number): void {
    this.seVolume = Math.max(0, Math.min(1, v));
    if (this.masterSeGain && this.ctx) {
      this.masterSeGain.gain.setTargetAtTime(this.seVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setTimingOffsetMs(ms: number): void {
    this.timingOffsetMs = ms;
  }

  public async switchTrack(trackId: TrackId, startOffsetSec?: number, fadeSec = 0.7): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const prevId = this.currentTrackId;
    this.currentTrackId = trackId;

    // Fade out other channels
    (['dreamy', 'normal', 'remix'] as TrackId[]).forEach((id) => {
      const ch = this.channels[id];
      if (!ch) return;
      if (id !== trackId) {
        ch.gain.gain.cancelScheduledValues(now);
        ch.gain.gain.setValueAtTime(ch.gain.gain.value, now);
        ch.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
        const targetEl = ch.el;
        setTimeout(() => {
          if (this.currentTrackId !== id) {
            targetEl.pause();
          }
        }, fadeSec * 1000 + 80);
      }
    });

    const next = this.channels[trackId];
    if (!next) return;

    if (typeof startOffsetSec === 'number') {
      try {
        next.el.currentTime = startOffsetSec;
      } catch {
        // Ignore seek before metadata loaded
      }
    } else if (prevId !== trackId) {
      try {
        if (next.el.paused && next.el.currentTime === 0 && TRACKS[trackId].feverStartOffsetSec > 0 && trackId === 'remix') {
          next.el.currentTime = TRACKS[trackId].feverStartOffsetSec;
        }
      } catch {
        // Ignore
      }
    }

    // Trigger play() immediately without awaiting resume() first so iOS Safari allows audio
    const playPromise = next.el.play();

    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(next.gain.gain.value, now);
    next.gain.gain.linearRampToValueAtTime(1, now + fadeSec);

    try {
      await playPromise;
    } catch {
      // Autoplay fallback handled on next user gesture via unlockOnGesture()
    }
  }

  public pause(): void {
    const ch = this.channels[this.currentTrackId];
    if (ch && !ch.el.paused) {
      ch.el.pause();
    }
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ch = this.channels[this.currentTrackId];
    if (ch && ch.el.paused && this.isReady) {
      void ch.el.play().catch(() => {});
    }
  }

  public stopAll(): void {
    const now = this.ctx?.currentTime ?? 0;
    (['dreamy', 'normal', 'remix'] as TrackId[]).forEach((id) => {
      const ch = this.channels[id];
      if (!ch) return;
      if (this.ctx) {
        ch.gain.gain.cancelScheduledValues(now);
        ch.gain.gain.setValueAtTime(0, now);
      }
      ch.el.pause();
      try {
        ch.el.currentTime = 0;
      } catch {
        // Ignore
      }
    });
    this.fallbackTime = 0;
  }

  public update(dt: number, paused = false): {
    songTimeSec: number;
    bpm: number;
    beatFloat: number;
    beatIndex: number;
    beatPhase: number;
    energy: number;
    bass: number;
  } {
    if (!paused) {
      this.fallbackTime += dt;
    }
    const track = TRACKS[this.currentTrackId];
    const ch = this.channels[this.currentTrackId];
    const rawTime = ch && !ch.el.paused && ch.el.currentTime > 0 ? ch.el.currentTime : this.fallbackTime;
    const songTimeSec = Math.max(0, rawTime + this.timingOffsetMs / 1000);
    const beatFloat = (songTimeSec * track.bpm) / 60;
    const beatIndex = Math.floor(beatFloat) % 4;
    const beatPhase = beatFloat - Math.floor(beatFloat);

    let energy = 0.15 + 0.15 * Math.pow(1 - beatPhase, 2);
    let bass = energy;

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      let lowSum = 0;
      for (let i = 0; i < this.freqData.length; i++) {
        sum += this.freqData[i];
        if (i < 8) lowSum += this.freqData[i];
      }
      const avg = sum / (this.freqData.length * 255);
      const lowAvg = lowSum / (8 * 255);
      if (avg > 0.005) {
        energy = Math.min(1, avg * 1.9);
        bass = Math.min(1, lowAvg * 1.45);
      }
    }

    return { songTimeSec, bpm: track.bpm, beatFloat, beatIndex, beatPhase, energy, bass };
  }

  /* ===== Synthesized Crystalline Music-Box Sound Effects ===== */

  public playCatchSE(judgment: Judgment, combo: number): void {
    if (!this.ctx || !this.masterSeGain || this.seVolume <= 0.001) return;
    const now = this.ctx.currentTime;

    if (judgment === 'MISS') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(g);
      g.connect(this.masterSeGain);
      osc.start(now);
      osc.stop(now + 0.18);
      return;
    }

    const idx = combo % CHIME_SCALE.length;
    const baseFreq = CHIME_SCALE[idx];
    const amp = judgment === 'PERFECT' ? 0.24 : judgment === 'GREAT' ? 0.18 : 0.13;

    // Glass droplet fundamental
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(amp, now + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);
    osc1.connect(g1);
    g1.connect(this.masterSeGain);
    osc1.start(now);
    osc1.stop(now + 0.44);

    // Crystal shimmer harmonic on PERFECT / GREAT
    if (judgment === 'PERFECT' || judgment === 'GREAT') {
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(baseFreq * 2, now);
      g2.gain.setValueAtTime(0.001, now);
      g2.gain.linearRampToValueAtTime(amp * 0.45, now + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
      osc2.connect(g2);
      g2.connect(this.masterSeGain);
      osc2.start(now);
      osc2.stop(now + 0.3);
    }

    // Extra fifth sparkle on PERFECT
    if (judgment === 'PERFECT') {
      const osc3 = this.ctx.createOscillator();
      const g3 = this.ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(baseFreq * 1.5, now + 0.02);
      g3.gain.setValueAtTime(0.001, now + 0.02);
      g3.gain.linearRampToValueAtTime(amp * 0.35, now + 0.03);
      g3.gain.exponentialRampToValueAtTime(0.0008, now + 0.36);
      osc3.connect(g3);
      g3.connect(this.masterSeGain);
      osc3.start(now + 0.02);
      osc3.stop(now + 0.38);
    }
  }

  public playPolishStepSE(step: number, perfect: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const freq = notes[Math.min(notes.length - 1, step)];

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = perfect ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(perfect ? 0.28 : 0.18, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  public playGemAscendSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    // Sparkling Cmaj9 arpeggio ("きらん！")
    const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98, 2093.0];
    arp.forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22 - i * 0.015, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.85);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.88);
    });
  }

  public playFeverStartSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [261.63, 392.0, 523.25, 659.25, 1046.5, 1318.51];
    chord.forEach((freq, i) => {
      const t = now + i * 0.035;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.015, t + 0.6);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.98);
    });
  }

  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [587.33, 880.0, 1174.66].forEach((freq, i) => {
      const t = now + i * 0.065;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }
}
