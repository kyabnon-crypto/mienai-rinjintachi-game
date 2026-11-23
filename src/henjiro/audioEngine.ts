import { HENJIRO_TRACKS } from './config';
import { BeatInfo, HenjiroTrackId } from './types';

// Warm F-major pentatonic / celesta & cozy post-study music-box scale
const STUDY_SCALE = [
  349.23, 392.0, 440.0, 523.25, 587.33,
  698.46, 783.99, 880.0, 1046.5, 1174.66,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class HenjiroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<HenjiroTrackId, TrackChannel>> = {};

  public currentTrackId: HenjiroTrackId = 'dreamy';
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

  public init(initialTrack: HenjiroTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as HenjiroTrackId[]).forEach((id) => {
      const el = new Audio(HENJIRO_TRACKS[id].url);
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
    trackId: HenjiroTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as HenjiroTrackId[]).forEach((id) => {
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
      // Will retry on next user gesture
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

  public pauseBgm(): void {
    const ch = this.channels[this.currentTrackId];
    if (ch && !ch.el.paused) {
      ch.el.pause();
    }
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
    (['dreamy', 'normal', 'instrumental'] as HenjiroTrackId[]).forEach((id) => {
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
    const def = HENJIRO_TRACKS[this.currentTrackId];
    const ch = this.channels[this.currentTrackId];

    let songTime = this.monotonicTime;
    let durationSec = def.durationSec;
    let ended = false;

    if (ch && this.isReady) {
      if (Number.isFinite(ch.el.duration) && ch.el.duration > 10) {
        durationSec = ch.el.duration;
      }
      if (!frozen) {
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
          if (songTime >= durationSec - 0.05) {
            ended = true;
          }
        }
      }
    } else if (!frozen) {
      this.monotonicTime += dt;
      songTime = this.monotonicTime;
    }

    const adjustedTime = Math.max(0, songTime + this.timingOffsetMs / 1000);
    const beatFloat = (adjustedTime * def.bpm) / 60;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;

    let energy = 0.24 + 0.16 * Math.sin(beatPhase * Math.PI);
    if (this.analyser && this.ctx && this.ctx.state === 'running' && !frozen) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      const bins = Math.min(20, this.freqData.length);
      for (let i = 0; i < bins; i++) sum += this.freqData[i];
      energy = Math.min(1, sum / (bins * 210));
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

  private playTone(
    freq: number,
    startOffset: number,
    duration: number,
    peakGain: number,
    type: OscillatorType = 'sine',
    freqEnd?: number
  ): void {
    if (!this.ctx || !this.masterSeGain) return;
    const t0 = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.masterSeGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private playPaperRustle(startOffset: number, duration: number, peakGain: number, centerHz = 2400): void {
    if (!this.ctx || !this.masterSeGain) return;
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * duration));
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((i / len) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centerHz;
    filter.Q.value = 1.6;
    const gain = this.ctx.createGain();
    const t0 = this.ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterSeGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** Soft paper smoothing + music-box chime when picking up a letter */
  public playLetterSmoothSE(combo: number, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    this.playPaperRustle(0, 0.075, 0.09, isRare ? 3100 : 2200);
    const idx = Math.min(STUDY_SCALE.length - 1, Math.max(0, combo % STUDY_SCALE.length));
    const f = STUDY_SCALE[idx];
    this.playTone(f, 0.005, 0.22, 0.16, 'triangle');
    this.playTone(f * 2, 0.015, 0.18, 0.07, 'sine');
    if (isRare) {
      this.playTone(f * 1.5, 0.06, 0.34, 0.14, 'sine');
      this.playTone(f * 2.5, 0.11, 0.36, 0.1, 'triangle');
    }
  }

  /** Delicate quill pen scratch + soft tone while writing a reply */
  public playQuillTickSE(progressRatio: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    this.playPaperRustle(0, 0.045, 0.07, 3400);
    const idx = Math.min(STUDY_SCALE.length - 1, Math.floor(progressRatio * 7));
    this.playTone(STUDY_SCALE[idx], 0, 0.11, 0.08, 'sine');
  }

  /** Wax seal stamp pop + gentle ascending reply chord */
  public playReplyFinishSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    // Wax stamp thump
    this.playTone(190, 0, 0.11, 0.22, 'sine', 96);
    // Warm Fmaj9 bell arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.playTone(f, 0.04 + i * 0.055, 0.42, 0.13, 'triangle');
    });
  }

  /** Quill Flourish — sweeping ink sparkle & blot purification */
  public playFlourishSE(clearedBlots: number): void {
    if (!this.ctx || !this.masterSeGain) return;
    this.playPaperRustle(0, 0.18, 0.11, 2800);
    this.playTone(440, 0, 0.24, 0.15, 'sine', 880);
    this.playTone(659.25, 0.04, 0.28, 0.13, 'triangle', 1046.5);
    if (clearedBlots > 0) {
      const count = Math.min(4, clearedBlots);
      for (let i = 0; i < count; i++) {
        this.playTone(STUDY_SCALE[4 + i], 0.07 + i * 0.045, 0.26, 0.12, 'sine');
      }
    }
  }

  /** Wax Seal batch dispatch from the tray */
  public playWaxDispatchSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    this.playTone(210, 0, 0.13, 0.24, 'sine', 105);
    const notes = [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5];
    notes.forEach((f, i) => {
      this.playTone(f, 0.04 + i * 0.05, 0.45, 0.14, 'triangle');
      this.playTone(f * 2, 0.05 + i * 0.05, 0.28, 0.05, 'sine');
    });
  }

  /** Reply order delivered to a window in town */
  public playOrderCompleteSE(grand = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const notes = grand
      ? [349.23, 440.0, 523.25, 698.46, 880.0, 1174.66]
      : [440.0, 523.25, 698.46, 880.0];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.065, 0.48, 0.14, 'triangle');
      this.playTone(f * 1.5, i * 0.065 + 0.02, 0.36, 0.06, 'sine');
    });
  }

  /** MOONLIGHT REPLY fever activation */
  public playFeverSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const notes = [349.23, 440.0, 523.25, 659.25, 783.99, 1046.5, 1396.91];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.055, 0.56, 0.15, 'triangle');
      this.playTone(f * 2, i * 0.055 + 0.02, 0.42, 0.06, 'sine');
    });
  }

  /** Ink blot touch (or blocked by round-glasses shield) */
  public playBlotHitSE(blocked: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    if (blocked) {
      this.playTone(698.46, 0, 0.22, 0.16, 'sine', 987.77);
      this.playTone(1046.5, 0.05, 0.28, 0.11, 'triangle');
    } else {
      this.playTone(230, 0, 0.22, 0.2, 'sawtooth', 110);
      this.playTone(170, 0.04, 0.24, 0.16, 'triangle', 88);
    }
  }

  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.playTone(f, i * 0.055, 0.34, 0.13, 'triangle');
    });
  }
}
