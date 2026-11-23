import { TSUMAZUKI_TRACKS } from './config';
import { BeatInfo, TsumazukiTrackId } from './types';

// Clear morning G-major pentatonic / glass-chime & celesta scale
const LANDING_SCALE = [
  392.0, 440.0, 493.88, 587.33, 659.25,
  783.99, 880.0, 987.77, 1174.66, 1318.51,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class TsumazukiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<TsumazukiTrackId, TrackChannel>> = {};

  public currentTrackId: TsumazukiTrackId = 'dreamy';
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

  public init(initialTrack: TsumazukiTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as TsumazukiTrackId[]).forEach((id) => {
      const el = new Audio(TSUMAZUKI_TRACKS[id].url);
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
    trackId: TsumazukiTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as TsumazukiTrackId[]).forEach((id) => {
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
    const track = TSUMAZUKI_TRACKS[this.currentTrackId];
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

  /** Delicate crystalline glass-bell chime when catching a floating dropped item */
  public playCatchItemSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(LANDING_SCALE.length - 1, combo % LANDING_SCALE.length);
    const freq = LANDING_SCALE[idx];

    const osc = this.ctx.createOscillator();
    const over = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    over.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    over.frequency.setValueAtTime(freq * 2, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isRare ? 0.22 : 0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRare ? 0.56 : 0.32));

    osc.connect(g);
    over.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    over.start(now);
    osc.stop(now + 0.6);
    over.stop(now + 0.6);

    if (isRare) {
      [1.25, 1.5, 2.0].forEach((mult, i) => {
        const o2 = this.ctx!.createOscillator();
        const g2 = this.ctx!.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq * mult, now + 0.045 * (i + 1));
        g2.gain.setValueAtTime(0.0001, now + 0.045 * (i + 1));
        g2.gain.linearRampToValueAtTime(0.14, now + 0.045 * (i + 1) + 0.015);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.045 * (i + 1) + 0.5);
        o2.connect(g2);
        g2.connect(this.masterSeGain!);
        o2.start(now + 0.045 * (i + 1));
        o2.stop(now + 0.045 * (i + 1) + 0.55);
      });
    }
  }

  /** Soft gentle tick while slowing time around a stumbling resident */
  public playSteadyTickSE(progressRatio: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const base = 520 + progressRatio * 340;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.08, now + 0.07);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.075, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Relieved warm morning chord when a resident regains balance ("運がよかった！") */
  public playResidentSavedSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [587.33, 739.99, 880.0, 1174.66]; // D major 7 sparkle
    chord.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      const st = now + i * 0.036;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.14, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.52);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(st);
      osc.stop(st + 0.56);
    });
  }

  /** Ethereal downward-then-upward time-dilation shimmer for "ほんのひと秒 (TIME SLOW)" */
  public playTimeSlowSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;

    // Gentle pitch-drop glass sweep (feeling time stretch!)
    const sweep = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(980, now);
    sweep.frequency.exponentialRampToValueAtTime(392, now + 0.34);
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.linearRampToValueAtTime(0.18, now + 0.025);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    sweep.connect(sg);
    sg.connect(this.masterSeGain);
    sweep.start(now);
    sweep.stop(now + 0.52);

    // Crystalline teal bell harmonic bloom
    const notes = [587.33, 880.0, 1174.66, 1318.51];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + 0.05 + i * 0.045;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.12, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.6);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.65);
    });
  }

  /** Order completed / basket return / round clear fanfare */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = grand
      ? [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66]
      : [493.88, 587.33, 783.99, 987.77];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + i * 0.06;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.68);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.72);
    });
  }

  /** SLOW SECOND fever start shimmer */
  public playFeverStartSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const arp = [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66, 1567.98];
    arp.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = i % 2 === 0 ? 'sine' : 'triangle';
      const st = now + i * 0.05;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.17, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.9);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.95);
    });
  }

  /** Soft bump or shield block when hitting a rushing swirl */
  public playRushBumpSE(blocked: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (blocked) {
      o.type = 'triangle';
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(988, now + 0.16);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.16, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    } else {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(195, now);
      o.frequency.exponentialRampToValueAtTime(92, now + 0.22);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    }
    o.connect(g);
    g.connect(this.masterSeGain);
    o.start(now);
    o.stop(now + 0.3);
  }

  /** Upgrade purchase chime */
  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [587.33, 783.99, 1174.66].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + i * 0.055;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.42);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.46);
    });
  }
}
