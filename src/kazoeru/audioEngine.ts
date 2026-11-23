import { KAZOERU_TRACKS } from './config';
import { BeatInfo, KazoeruTrackId } from './types';

// Gentle moonlit F-major pentatonic / celesta & wooden abacus chime scale
const PARK_NIGHT_SCALE = [
  349.23, 392.0, 440.0, 523.25, 587.33,
  698.46, 783.99, 880.0, 1046.5, 1174.66,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class KazoeruAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<KazoeruTrackId, TrackChannel>> = {};

  public currentTrackId: KazoeruTrackId = 'dreamy';
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

  public init(initialTrack: KazoeruTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as KazoeruTrackId[]).forEach((id) => {
      const el = new Audio(KAZOERU_TRACKS[id].url);
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
    trackId: KazoeruTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as KazoeruTrackId[]).forEach((id) => {
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
    const track = KAZOERU_TRACKS[this.currentTrackId];
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

  /** Warm glass-bead / wooden abacus chime when gathering a floating memory light */
  public playGatherTokenSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(PARK_NIGHT_SCALE.length - 1, combo % PARK_NIGHT_SCALE.length);
    const freq = PARK_NIGHT_SCALE[idx];

    const osc = this.ctx.createOscillator();
    const over = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    over.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    over.frequency.setValueAtTime(freq * 2, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isRare ? 0.22 : 0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRare ? 0.56 : 0.3));

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
        const st = now + 0.045 * (i + 1);
        o2.frequency.setValueAtTime(freq * mult, st);
        g2.gain.setValueAtTime(0.0001, st);
        g2.gain.linearRampToValueAtTime(0.14, st + 0.014);
        g2.gain.exponentialRampToValueAtTime(0.0001, st + 0.48);
        o2.connect(g2);
        g2.connect(this.masterSeGain!);
        o2.start(st);
        o2.stop(st + 0.52);
      });
    }
  }

  /** Crisp wooden tally counter click + pencil-on-notebook stroke when etching a 正 stroke */
  public playStrokeTickSE(strokeIndex: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    const base = 440 + Math.min(5, strokeIndex) * 72;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.12, now + 0.065);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.085, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Warm starlight chord when completing a full 5-stroke 「正」 tally ("えらかったね") */
  public playTallyCompleteSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C major / Fmaj9 warmth
    chord.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      const st = now + i * 0.038;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.54);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(st);
      osc.stop(st + 0.58);
    });
  }

  /** Gentle swing creak-chime + moonlit bell bloom for SWING TALLY ("数え鳴らし") */
  public playSwingTallySE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;

    // Gentle upward-downward swing arc tone ("きい……こ")
    const arc = this.ctx.createOscillator();
    const ag = this.ctx.createGain();
    arc.type = 'sine';
    arc.frequency.setValueAtTime(392, now);
    arc.frequency.exponentialRampToValueAtTime(698.46, now + 0.18);
    arc.frequency.exponentialRampToValueAtTime(523.25, now + 0.42);
    ag.gain.setValueAtTime(0.0001, now);
    ag.gain.linearRampToValueAtTime(0.17, now + 0.025);
    ag.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    arc.connect(ag);
    ag.connect(this.masterSeGain);
    arc.start(now);
    arc.stop(now + 0.52);

    // Moonlit lantern harmonic shimmer
    const notes = [523.25, 698.46, 880.0, 1174.66];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      const st = now + 0.05 + i * 0.042;
      o.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.12, st + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.58);
      o.connect(g);
      g.connect(this.masterSeGain!);
      o.start(st);
      o.stop(st + 0.62);
    });
  }

  /** Order completed / scroll archived / round clear fanfare */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = grand
      ? [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5]
      : [440.0, 523.25, 698.46, 880.0];
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

  /** STARLIGHT TALLY fever shimmer */
  public playFeverStartSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const arp = [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5, 1396.91];
    arp.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = i % 2 === 0 ? 'sine' : 'triangle';
      const st = now + i * 0.048;
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

  /** Soft bump or beanie-warmth shield block when hitting a forgetful gust */
  public playGustBumpSE(blocked: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (blocked) {
      o.type = 'triangle';
      o.frequency.setValueAtTime(620, now);
      o.frequency.exponentialRampToValueAtTime(930, now + 0.16);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.16, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    } else {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(185, now);
      o.frequency.exponentialRampToValueAtTime(88, now + 0.22);
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
    [523.25, 698.46, 1046.5].forEach((f, i) => {
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
