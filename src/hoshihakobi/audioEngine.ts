import { HOSHIHAKOBI_TRACKS } from './config';
import { BeatInfo, HoshihakobiTrackId } from './types';

// Twinkling F-major / lydian celesta & starlight glockenspiel scale for the starry rooftop
const STARLIGHT_SCALE = [
  349.23, 392.0, 440.0, 523.25, 587.33,
  698.46, 783.99, 880.0, 1046.5, 1174.66,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class HoshihakobiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<HoshihakobiTrackId, TrackChannel>> = {};

  public currentTrackId: HoshihakobiTrackId = 'dreamy';
  public bgmVolume = 0.72;
  public seVolume = 0.85;
  public timingOffsetMs = 0;
  public isReady = false;

  private monotonicTime = 0;

  public unlockOnGesture(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ch = this.channels[this.currentTrackId];
    if (ch && ch.el.paused && !ch.el.ended && this.isReady) {
      void ch.el.play().catch(() => {});
    }
  }

  public init(initialTrack: HoshihakobiTrackId): void {
    if (this.ctx) {
      this.unlockOnGesture();
      void this.switchTrack(initialTrack, 0, 0.45, false);
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
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

    (['dreamy', 'normal', 'instrumental'] as HoshihakobiTrackId[]).forEach((id) => {
      const el = new Audio(HOSHIHAKOBI_TRACKS[id].url);
      el.loop = false;
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
    void this.switchTrack(initialTrack, 0, 0.45, false);
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

  public async switchTrack(
    trackId: HoshihakobiTrackId,
    startOffsetSec?: number,
    fadeSec = 0.55,
    loop = false
  ): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    this.currentTrackId = trackId;

    (['dreamy', 'normal', 'instrumental'] as HoshihakobiTrackId[]).forEach((id) => {
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
    next.el.loop = loop;

    if (typeof startOffsetSec === 'number') {
      try {
        next.el.currentTime = startOffsetSec;
      } catch {
        // Ignore seek before metadata loaded
      }
      this.monotonicTime = startOffsetSec;
    } else {
      this.monotonicTime = next.el.currentTime || 0;
    }

    const playPromise = next.el.play();
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(next.gain.gain.value, now);
    next.gain.gain.linearRampToValueAtTime(1, now + fadeSec);

    try {
      await playPromise;
    } catch {
      // Browser autoplay restriction handled on next gesture
    }
  }

  public pause(): void {
    const ch = this.channels[this.currentTrackId];
    if (ch && !ch.el.paused) ch.el.pause();
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public pauseBgm(): void {
    const ch = this.channels[this.currentTrackId];
    if (ch && !ch.el.paused) ch.el.pause();
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ch = this.channels[this.currentTrackId];
    if (ch && ch.el.paused && !ch.el.ended) {
      void ch.el.play().catch(() => {});
    }
  }

  public stopAll(): void {
    (['dreamy', 'normal', 'instrumental'] as HoshihakobiTrackId[]).forEach((id) => {
      const ch = this.channels[id];
      if (!ch) return;
      ch.el.pause();
      try {
        ch.el.currentTime = 0;
      } catch {
        // Ignore
      }
    });
    this.monotonicTime = 0;
  }

  public update(dt: number, frozen: boolean): BeatInfo {
    const def = HOSHIHAKOBI_TRACKS[this.currentTrackId];
    const ch = this.channels[this.currentTrackId];

    let songTime = this.monotonicTime;
    let durationSec = def.durationSec;
    let ended = false;

    if (ch && !frozen) {
      if (Number.isFinite(ch.el.duration) && ch.el.duration > 10) {
        durationSec = Math.min(def.durationSec, ch.el.duration);
      }
      if (!ch.el.paused && !ch.el.ended) {
        songTime = ch.el.currentTime;
        this.monotonicTime = songTime;
      } else if (ch.el.ended) {
        songTime = durationSec;
        this.monotonicTime = durationSec;
        ended = true;
      } else {
        this.monotonicTime = Math.min(durationSec, this.monotonicTime + dt);
        songTime = this.monotonicTime;
      }
    }

    if (songTime >= durationSec - 0.08 && !frozen) {
      ended = true;
    }

    const adjustedTime = Math.max(0, songTime + this.timingOffsetMs / 1000);
    const beatFloat = (adjustedTime * def.bpm) / 60;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;

    let energy = 0.28 + 0.16 * Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);
    if (this.analyser && this.ctx && this.ctx.state === 'running') {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      const count = Math.min(20, this.freqData.length);
      for (let i = 0; i < count; i++) sum += this.freqData[i];
      energy = Math.min(1, sum / (count * 175));
    }

    const remainingSec = Math.max(0, durationSec - songTime);
    const progress = Math.max(0, Math.min(1, songTime / Math.max(1, durationSec)));

    return {
      songTime,
      beatFloat,
      beatIndex,
      beatPhase,
      bpm: def.bpm,
      energy,
      durationSec,
      remainingSec,
      progress,
      ended,
    };
  }

  /** Delicate celesta / star-chime twinkle when gathering a wish star */
  public playStarCollectSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const baseFreq = STARLIGHT_SCALE[combo % STARLIGHT_SCALE.length];

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * (isRare ? 1.5 : 1), now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (isRare ? 2.0 : 1.25), now + 0.11);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isRare ? 0.24 : 0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRare ? 0.44 : 0.25));

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + (isRare ? 0.46 : 0.27));

    // Harmonic sparkle overtone
    const shimmer = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(baseFreq * 2, now + 0.015);
    sg.gain.setValueAtTime(0.0001, now + 0.015);
    sg.gain.linearRampToValueAtTime(isRare ? 0.13 : 0.075, now + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    shimmer.connect(sg);
    sg.connect(this.masterSeGain);
    shimmer.start(now + 0.015);
    shimmer.stop(now + 0.3);
  }

  /** Soft crystalline step chime while nudging stars into alignment at a spot */
  public playAlignStepSE(stepIndex: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const freq = STARLIGHT_SCALE[Math.min(STARLIGHT_SCALE.length - 1, 2 + stepIndex * 2)];

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  /** Radiant shooting-star whoosh + ascending music-box arpeggio when a constellation lights up */
  public playConstellationCompleteSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];

    notes.forEach((f, idx) => {
      const t = now + idx * 0.055;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }

  /** Starlight Wand wave ("星の並べ替え / STAR SHIFT") shimmering glissando */
  public playStarShiftSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const sweep = [440, 587.33, 698.46, 880, 1174.66, 1396.91];

    sweep.forEach((f, i) => {
      const t = now + i * 0.036;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.22);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  /** Wooden star crate opening & soaring into the starry sky */
  public playCrateReleaseSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [349.23, 440, 523.25, 698.46, 880, 1046.5];

    chord.forEach((f, i) => {
      const t = now + i * 0.048;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  /** Constellation order or round completion fanfare */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = grand
      ? [349.23, 440, 523.25, 698.46, 880, 1046.5, 1396.91]
      : [440, 523.25, 698.46, 880, 1046.5];

    notes.forEach((f, idx) => {
      const t = now + idx * 0.068;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(grand ? 0.17 : 0.14, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  /** STARLIGHT MIRACLE fever burst */
  public playFeverSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = [349.23, 523.25, 698.46, 880, 1046.5, 1396.91, 1760];

    notes.forEach((f, idx) => {
      const t = now + idx * 0.05;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  /** Soft muted thump when bumping into clouded star mist */
  public playCloudHitSE(shielded: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = shielded ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(shielded ? 460 : 185, now);
    osc.frequency.exponentialRampToValueAtTime(shielded ? 698 : 88, now + 0.22);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(shielded ? 0.16 : 0.14, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  /** Warm wooden & starlight chime when purchasing a workshop upgrade */
  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = now + i * 0.055;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}
