import { NUKUMORI_TRACKS } from './config';
import { NukumoriTrackId } from './types';

// Warm G-major pentatonic / kettle-chime & cozy music-box scale
const WARM_SCALE = [
  392.0, 440.0, 493.88, 587.33, 659.25,
  783.99, 880.0, 987.77, 1174.66, 1318.51,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class NukumoriAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<NukumoriTrackId, TrackChannel>> = {};

  public currentTrackId: NukumoriTrackId = 'dreamy';
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

  public init(initialTrack: NukumoriTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as NukumoriTrackId[]).forEach((id) => {
      const el = new Audio(NUKUMORI_TRACKS[id].url);
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
    trackId: NukumoriTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as NukumoriTrackId[]).forEach((id) => {
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
    (['dreamy', 'normal', 'instrumental'] as NukumoriTrackId[]).forEach((id) => {
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
    const track = NUKUMORI_TRACKS[this.currentTrackId];
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

  /** Cozy kettle-puff & warm chime when collecting a warmth seed */
  public playCollectSE(combo: number, isStarSteam = false): void {
    const idx = Math.min(WARM_SCALE.length - 1, combo % WARM_SCALE.length);
    const freq = WARM_SCALE[idx];
    this.playTone(freq * 0.5, 0, 0.09, 'sine', 0.12, freq);
    this.playTone(freq, 0.012, isStarSteam ? 0.44 : 0.28, 'sine', isStarSteam ? 0.23 : 0.18);
    this.playTone(freq * 1.5, 0.028, 0.22, 'triangle', 0.08);
    if (isStarSteam) {
      this.playTone(freq * 2, 0.055, 0.36, 'sine', 0.15);
      this.playTone(freq * 2.5, 0.11, 0.32, 'sine', 0.1);
    }
  }

  /** Soft glowing shimmer when a chilly bench finishes warming into "just right" comfort */
  public playBenchWarmedSE(perfectBeat = false): void {
    const chord = perfectBeat
      ? [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66]
      : [392.0, 493.88, 587.33, 783.99];
    chord.forEach((f, i) => {
      this.playTone(f, i * 0.045, 0.48, 'sine', 0.17);
      this.playTone(f * 2, i * 0.045 + 0.018, 0.26, 'triangle', 0.055);
    });
  }

  /** Soft steam-whoosh + brass dial tick when triggering Steam Wave */
  public playSteamWaveSE(meltedCount: number): void {
    this.playTone(293.66, 0, 0.32, 'sine', 0.16, 659.25);
    this.playTone(440.0, 0.04, 0.34, 'triangle', 0.13, 880.0);
    this.playTone(659.25, 0.09, 0.38, 'sine', 0.14);
    if (meltedCount > 0) {
      this.playTone(987.77, 0.14, 0.38, 'sine', 0.17);
      this.playTone(1318.51, 0.2, 0.4, 'sine', 0.14);
    }
  }

  /** Heartwarming hot-can delivery & order complete chord */
  public playOrderCompleteSE(isGrand = false): void {
    const chord = isGrand
      ? [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66]
      : [440.0, 554.37, 659.25, 880.0];
    chord.forEach((f, i) => {
      this.playTone(f, i * 0.055, isGrand ? 0.62 : 0.46, 'sine', 0.19);
      this.playTone(f * 1.5, i * 0.055 + 0.015, 0.3, 'triangle', 0.06);
    });
  }

  /** POKAPOKA NIGHT (Fever) cozy music-box sweep */
  public playFeverStartSE(): void {
    const notes = [392.0, 493.88, 587.33, 659.25, 783.99, 987.77, 1174.66];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.048, 0.65, 'sine', 0.19);
      this.playTone(f * 1.5, i * 0.048 + 0.02, 0.4, 'triangle', 0.07);
    });
  }

  public playFrostHitSE(): void {
    this.playTone(260, 0, 0.22, 'sawtooth', 0.12, 115);
    this.playTone(185, 0.05, 0.24, 'triangle', 0.12, 92);
  }

  public playShieldBlockSE(): void {
    this.playTone(880.0, 0, 0.2, 'sine', 0.18, 1318.51);
    this.playTone(1174.66, 0.06, 0.26, 'triangle', 0.13);
  }

  public playUpgradeSE(): void {
    const notes = [440.0, 554.37, 659.25, 880.0];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.06, 0.34, 'sine', 0.17);
    });
  }
}
