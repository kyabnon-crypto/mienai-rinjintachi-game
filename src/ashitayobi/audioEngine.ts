import { ASHITAYOBI_TRACKS } from './config';
import { AshitayobiTrackId, BeatInfo } from './types';

// Bright F-major / pentatonic sunrise bell & morning chime scale for the Dawn Post Office
const DAWN_CHIME_SCALE = [
  349.23, 392.0, 440.0, 523.25, 587.33,
  698.46, 783.99, 880.0, 1046.5, 1174.66,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class AshitayobiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<AshitayobiTrackId, TrackChannel>> = {};

  public currentTrackId: AshitayobiTrackId = 'dreamy';
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

  public init(initialTrack: AshitayobiTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as AshitayobiTrackId[]).forEach((id) => {
      const el = new Audio(ASHITAYOBI_TRACKS[id].url);
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
    trackId: AshitayobiTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as AshitayobiTrackId[]).forEach((id) => {
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
    (['dreamy', 'normal', 'instrumental'] as AshitayobiTrackId[]).forEach((id) => {
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
    const def = ASHITAYOBI_TRACKS[this.currentTrackId];
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

  /** Warm sunrise bell chime when gathering a dawn light */
  public playDawnCollectSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const baseFreq = DAWN_CHIME_SCALE[combo % DAWN_CHIME_SCALE.length];

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * (isRare ? 1.5 : 1), now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (isRare ? 2.0 : 1.18), now + 0.12);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isRare ? 0.24 : 0.16, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRare ? 0.46 : 0.26));

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + (isRare ? 0.48 : 0.28));

    // Morning shimmer harmonic
    const harm = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(baseFreq * 2.5, now + 0.012);
    sg.gain.setValueAtTime(0.0001, now + 0.012);
    sg.gain.linearRampToValueAtTime(isRare ? 0.12 : 0.07, now + 0.028);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    harm.connect(sg);
    sg.connect(this.masterSeGain);
    harm.start(now + 0.012);
    harm.stop(now + 0.3);
  }

  /** Soft morning resonance while warming up a sleeping window spot */
  public playDeliverStepSE(stepIndex: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const freq = DAWN_CHIME_SCALE[Math.min(DAWN_CHIME_SCALE.length - 1, 2 + stepIndex * 2)];

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /** Radiant sunrise chord when a morning bottle is placed at a window ("新しい朝が届いた！") */
  public playWindowDeliveredSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, idx) => {
      const t = now + idx * 0.052;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.46);
    });
  }

  /** "特別な朝焼け" Dawn Delivery wave shimmering sunrise glissando */
  public playDawnWaveSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const sweep = [440.0, 523.25, 659.25, 783.99, 1046.5, 1318.51];

    sweep.forEach((f, i) => {
      const t = now + i * 0.036;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.24);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  /** Dawn Satchel flight dispatch across the town sky */
  public playSatchelDispatchSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const chord = [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5];

    chord.forEach((f, i) => {
      const t = now + i * 0.048;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  /** Delivery order or round completion fanfare */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = grand
      ? [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5, 1396.91]
      : [440.0, 523.25, 698.46, 880.0, 1046.5];

    notes.forEach((f, idx) => {
      const t = now + idx * 0.068;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(grand ? 0.17 : 0.14, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  /** GOLDEN DAYBREAK ("夜明けの特別配達") fever burst */
  public playFeverSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const notes = [349.23, 523.25, 698.46, 880.0, 1046.5, 1396.91, 1760.0];

    notes.forEach((f, idx) => {
      const t = now + idx * 0.05;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  /** Soft muffled tone when colliding with sleepless night gloom ("眠れぬ夜霧") */
  public playGloomHitSE(shielded: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = shielded ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(shielded ? 520 : 170, now);
    osc.frequency.exponentialRampToValueAtTime(shielded ? 780 : 82, now + 0.22);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(shielded ? 0.16 : 0.14, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    osc.connect(g);
    g.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  /** Warm sunrise chime when purchasing a Dawn Post Office upgrade */
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
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.37);
    });
  }
}
