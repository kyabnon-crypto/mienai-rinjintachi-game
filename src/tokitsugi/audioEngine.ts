import { TOKITSUGI_TRACKS } from './config';
import { TokitsugiTrackId } from './types';

// Warm D-major antique pocket-watch celesta / music-box scale
const CLOCK_SCALE = [
  587.33, 659.25, 739.99, 880.0, 987.77,
  1174.66, 1318.51, 1479.98, 1760.0, 1975.53,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class TokitsugiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<TokitsugiTrackId, TrackChannel>> = {};

  public currentTrackId: TokitsugiTrackId = 'dreamy';
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

  public init(initialTrack: TokitsugiTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as TokitsugiTrackId[]).forEach((id) => {
      const el = new Audio(TOKITSUGI_TRACKS[id].url);
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

  public setCurrentTrackLoop(loop: boolean): void {
    const ch = this.channels[this.currentTrackId];
    if (ch) ch.el.loop = loop;
  }

  public async switchTrack(
    trackId: TokitsugiTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as TokitsugiTrackId[]).forEach((id) => {
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
      // Autoplay fallback handled on next gesture
    }
  }

  public pauseBgm(): void {
    const ch = this.channels[this.currentTrackId];
    if (ch && !ch.el.paused) {
      ch.el.pause();
    }
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
    const now = this.ctx?.currentTime ?? 0;
    (['dreamy', 'normal', 'instrumental'] as TokitsugiTrackId[]).forEach((id) => {
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
    this.monotonicTime = 0;
  }

  public update(dt: number, paused = false): {
    songTimeSec: number;
    durationSec: number;
    progress: number;
    remainingSec: number;
    ended: boolean;
    bpm: number;
    beatFloat: number;
    beatIndex: number;
    beatPhase: number;
    energy: number;
    bass: number;
  } {
    const track = TOKITSUGI_TRACKS[this.currentTrackId];
    const ch = this.channels[this.currentTrackId];

    if (!paused) {
      const elPlaying =
        ch && !ch.el.paused && !ch.el.ended && ch.el.readyState >= 2 && ch.el.currentTime > 0.02;
      if (elPlaying) {
        if (ch.el.loop && ch.el.currentTime + 2 < this.monotonicTime) {
          this.monotonicTime = ch.el.currentTime;
        } else {
          const audioT = ch.el.currentTime;
          if (audioT > this.monotonicTime) {
            this.monotonicTime = audioT;
          } else {
            this.monotonicTime += dt;
          }
        }
      } else {
        this.monotonicTime += dt;
      }
    }

    const durationSec =
      ch && Number.isFinite(ch.el.duration) && ch.el.duration > 10 ? ch.el.duration : track.durationSec;

    const rawTime = Math.max(0, this.monotonicTime + this.timingOffsetMs / 1000);
    const ended = !ch?.el.loop && (Boolean(ch?.el.ended) || this.monotonicTime >= durationSec - 0.08);
    const progress = Math.min(1, Math.max(0, this.monotonicTime / durationSec));
    const remainingSec = Math.max(0, durationSec - this.monotonicTime);

    const beatsPerSec = track.bpm / 60;
    const beatFloat = rawTime * beatsPerSec;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;

    let energy = 0.25;
    let bass = 0.22;
    if (this.analyser && !paused) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      let bassSum = 0;
      const len = this.freqData.length;
      for (let i = 0; i < len; i++) {
        sum += this.freqData[i];
        if (i < 8) bassSum += this.freqData[i];
      }
      energy = sum / (len * 255);
      bass = bassSum / (8 * 255);
    }

    return {
      songTimeSec: this.monotonicTime,
      durationSec,
      progress,
      remainingSec,
      ended,
      bpm: track.bpm,
      beatFloat,
      beatIndex,
      beatPhase,
      energy,
      bass,
    };
  }

  private playTone(
    freq: number,
    startDelay: number,
    dur: number,
    type: OscillatorType,
    peakGain: number,
    endFreq?: number
  ): void {
    if (!this.ctx || !this.masterSeGain || this.seVolume <= 0.001) return;
    const now = this.ctx.currentTime + startDelay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  /** Delicate pocket-watch tick + music-box chime when stitching a fragment */
  public playStitchSE(combo: number, isPerfect: boolean, isDream = false): void {
    // Crisp clockwork escapement click
    this.playTone(isPerfect ? 2600 : 1950, 0, 0.04, 'triangle', 0.14, 980);

    const idx = Math.min(CLOCK_SCALE.length - 1, combo % CLOCK_SCALE.length);
    const freq = CLOCK_SCALE[idx];
    this.playTone(freq, 0.008, isPerfect ? 0.34 : 0.24, 'sine', isPerfect ? 0.24 : 0.18);
    if (isPerfect) {
      this.playTone(freq * 1.5, 0.022, 0.28, 'triangle', 0.12);
    }
    if (isDream) {
      this.playTone(freq * 2, 0.045, 0.36, 'sine', 0.15);
      this.playTone(freq * 2.5, 0.09, 0.32, 'sine', 0.1);
    }
  }

  /** Golden thread harp glissando when completing a paired Thread Link */
  public playLinkSE(): void {
    const notes = [880.0, 1174.66, 1479.98, 1760.0];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.045, 0.32, 'sine', 0.17);
      this.playTone(f * 2, i * 0.045 + 0.01, 0.18, 'triangle', 0.06);
    });
  }

  /** Satisfying reverse-winding spring & chime for Rewind Stitch */
  public playRewindSE(purifiedCount: number): void {
    // Rapid reverse gear ticks
    for (let i = 0; i < 6; i++) {
      this.playTone(1100 + i * 240, i * 0.032, 0.045, 'triangle', 0.11);
    }
    this.playTone(587.33, 0.08, 0.28, 'sine', 0.16, 1174.66);
    if (purifiedCount > 0) {
      this.playTone(1479.98, 0.16, 0.36, 'sine', 0.18);
      this.playTone(1760.0, 0.22, 0.38, 'sine', 0.15);
    }
  }

  /** Warm antique music-box chord when a broken-time order is repaired */
  public playOrderCompleteSE(): void {
    const chord = [587.33, 739.99, 880.0, 1174.66, 1479.98];
    chord.forEach((f, i) => {
      this.playTone(f, i * 0.06, 0.55, 'sine', 0.18);
      this.playTone(f * 2, i * 0.06 + 0.015, 0.3, 'triangle', 0.06);
    });
  }

  /** Winding & sending a fully mended pocket watch back to its owner */
  public playWatchMendedSE(): void {
    const arpeggio = [587.33, 880.0, 1174.66, 1479.98, 1760.0, 2349.32];
    arpeggio.forEach((f, i) => {
      this.playTone(f, i * 0.055, 0.52, 'sine', 0.17);
    });
  }

  /** Golden Hour (Fever) activation chime */
  public playFeverStartSE(): void {
    const bell = [440.0, 587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
    bell.forEach((f, i) => {
      this.playTone(f, i * 0.05, 0.65, 'sine', 0.19);
      this.playTone(f * 1.5, i * 0.05 + 0.02, 0.4, 'triangle', 0.07);
    });
  }

  public playRiftHitSE(): void {
    this.playTone(210, 0, 0.24, 'sawtooth', 0.14, 95);
    this.playTone(155, 0.05, 0.26, 'triangle', 0.14, 78);
  }

  public playShieldBlockSE(): void {
    this.playTone(1046.5, 0, 0.2, 'sine', 0.18, 1567.98);
    this.playTone(1318.51, 0.06, 0.26, 'triangle', 0.13);
  }

  public playUpgradeSE(): void {
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.06, 0.34, 'sine', 0.17);
    });
  }

  public playSoftMissTick(): void {
    this.playTone(520, 0, 0.05, 'triangle', 0.07, 360);
  }
}
