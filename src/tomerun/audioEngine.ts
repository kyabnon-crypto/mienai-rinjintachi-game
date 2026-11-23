import { TOMERUN_TRACKS } from './config';
import { BeatInfo, TomerunTrackId } from './types';

// Crystalline D-major / celesta & glass-jar harmonic scale for the frosty time vault
const VAULT_GLASS_SCALE = [
  293.66, 329.63, 369.99, 440.0, 493.88,
  587.33, 659.25, 739.99, 880.0, 987.77,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class TomerunAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<TomerunTrackId, TrackChannel>> = {};

  public currentTrackId: TomerunTrackId = 'dreamy';
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

  public init(initialTrack: TomerunTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as TomerunTrackId[]).forEach((id) => {
      const el = new Audio(TOMERUN_TRACKS[id].url);
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
    trackId: TomerunTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as TomerunTrackId[]).forEach((id) => {
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
      // Autoplay blocked until next gesture
    }
  }

  public pauseBgm(): void {
    Object.values(this.channels).forEach((ch) => {
      if (ch && !ch.el.paused) ch.el.pause();
    });
  }

  public pause(): void {
    this.pauseBgm();
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ch = this.channels[this.currentTrackId];
    if (ch && ch.el.paused && !ch.el.ended && this.isReady) {
      void ch.el.play().catch(() => {});
    }
  }

  public stopAll(): void {
    Object.values(this.channels).forEach((ch) => {
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

  public update(dt: number, freezeClock = false): BeatInfo {
    const track = TOMERUN_TRACKS[this.currentTrackId];
    const ch = this.channels[this.currentTrackId];
    const durationSec =
      ch && Number.isFinite(ch.el.duration) && ch.el.duration > 10
        ? ch.el.duration
        : track.durationSec;

    let ended = false;
    if (!freezeClock) {
      if (ch && !ch.el.paused && ch.el.readyState >= 2) {
        this.monotonicTime = ch.el.currentTime;
      } else {
        this.monotonicTime += dt;
      }
      if ((ch && ch.el.ended) || this.monotonicTime >= durationSec - 0.08) {
        ended = true;
      }
    }

    const songTime = Math.max(0, this.monotonicTime + this.timingOffsetMs / 1000);
    const beatFloat = (songTime * track.bpm) / 60;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;
    const progress = Math.min(1, Math.max(0, this.monotonicTime / Math.max(1, durationSec)));
    const remainingSec = Math.max(0, durationSec - this.monotonicTime);

    let energy = 0.25;
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      const len = Math.min(24, this.freqData.length);
      for (let i = 0; i < len; i++) sum += this.freqData[i];
      energy = Math.min(1, sum / (len * 210));
    }

    return {
      songTime,
      beatFloat,
      beatIndex,
      beatPhase,
      bpm: track.bpm,
      energy,
      durationSec,
      remainingSec,
      progress,
      ended,
    };
  }

  /** Delicate glass-jar & frost chime when gathering a floating moment token */
  public playGatherTokenSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(VAULT_GLASS_SCALE.length - 1, combo % VAULT_GLASS_SCALE.length);
    const freq = VAULT_GLASS_SCALE[idx];

    const osc = this.ctx.createOscillator();
    const over = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    over.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    over.frequency.setValueAtTime(freq * 2.0, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isRare ? 0.22 : 0.14, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRare ? 0.62 : 0.32));

    osc.connect(g);
    over.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    over.start(now);
    osc.stop(now + 0.66);
    over.stop(now + 0.66);

    if (isRare) {
      [1.25, 1.5, 2.0].forEach((mult, i) => {
        const o2 = this.ctx!.createOscillator();
        const g2 = this.ctx!.createGain();
        o2.type = 'sine';
        const st = now + 0.045 * (i + 1);
        o2.frequency.setValueAtTime(freq * mult, st);
        g2.gain.setValueAtTime(0.0001, st);
        g2.gain.linearRampToValueAtTime(0.14, st + 0.012);
        g2.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
        o2.connect(g2);
        g2.connect(this.masterSeGain!);
        o2.start(st);
        o2.stop(st + 0.54);
      });
    }
  }

  /** Soft clockwork tick ("カチ、コチ…") while extending a time spot */
  public playHourglassTickSE(stepIndex: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    const base = 520 + (stepIndex % 2 === 0 ? 0 : 95) + Math.min(4, stepIndex) * 48;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.88, now + 0.055);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.08, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Warm crystalline bottle-seal chord when a precious moment is preserved */
  public playMomentSavedSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [587.33, 739.99, 880.0, 1174.66]; // D major warmth
    chord.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      const st = now + i * 0.036;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.58);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(st);
      osc.stop(st + 0.62);
    });
  }

  /** Brass valve turn + crystalline time-suspend shimmer for VALVE PAUSE ("バルブ回し") */
  public playValvePauseSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;

    // Gentle descending time-slow sweep ("すぅっ…と時間がゆるむ")
    const sweep = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(660, now);
    sweep.frequency.exponentialRampToValueAtTime(293.66, now + 0.42);
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.linearRampToValueAtTime(0.17, now + 0.024);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);
    sweep.connect(sg);
    sg.connect(this.masterSeGain);
    sweep.start(now);
    sweep.stop(now + 0.58);

    // Brass valve click + frost-gold harmonic bloom
    const notes = [587.33, 880.0, 1174.66, 1479.98];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      const st = now + 0.04 + i * 0.045;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.12, st + 0.016);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.68);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.72);
    });
  }

  /** Order completed / jar shelved / round clear fanfare */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = grand
      ? [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66]
      : [440.0, 587.33, 739.99, 880.0];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + i * 0.056;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.016);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.68);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.72);
    });
  }

  /** ETERNAL SHELF fever golden-frost arpeggio */
  public playFeverStartSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const arp = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66, 1479.98];
    arp.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = i % 2 === 0 ? 'sine' : 'triangle';
      const st = now + i * 0.044;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.92);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.96);
    });
  }

  /** Soft bump or fluffy blue-blanket shield block when hitting a Hurry Vortex */
  public playHurryBumpSE(blocked: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (blocked) {
      o.type = 'triangle';
      o.frequency.setValueAtTime(580, now);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.16);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.16, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    } else {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(210, now);
      o.frequency.exponentialRampToValueAtTime(92, now + 0.22);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    }
    o.connect(g);
    g.connect(this.masterSeGain);
    o.start(now);
    o.stop(now + 0.3);
  }

  /** Upgrade purchase glass-bell chime */
  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [587.33, 739.99, 1174.66].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + i * 0.055;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.44);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.48);
    });
  }
}
