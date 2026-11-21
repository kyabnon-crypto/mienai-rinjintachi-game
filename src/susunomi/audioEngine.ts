import { SUSUNOMI_TRACKS } from './config';
import { SusunomiTrackId } from './types';

// Warm G-major pentatonic / celesta kitchen chime scale
const KITCHEN_SCALE = [
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
];

interface TrackChannel {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class SusunomiAudioEngine {
  private ctx: AudioContext | null = null;
  private masterBgmGain: GainNode | null = null;
  private masterSeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData = new Uint8Array(64);
  private channels: Partial<Record<SusunomiTrackId, TrackChannel>> = {};

  public currentTrackId: SusunomiTrackId = 'dreamy';
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

  public init(initialTrack: SusunomiTrackId): void {
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

    (['dreamy', 'normal', 'instrumental'] as SusunomiTrackId[]).forEach((id) => {
      const el = new Audio(SUSUNOMI_TRACKS[id].url);
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
    trackId: SusunomiTrackId,
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

    (['dreamy', 'normal', 'instrumental'] as SusunomiTrackId[]).forEach((id) => {
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
    (['dreamy', 'normal', 'instrumental'] as SusunomiTrackId[]).forEach((id) => {
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
    const track = SUSUNOMI_TRACKS[this.currentTrackId];
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

    let energy = 0.25 + 0.18 * Math.pow(1 - beatPhase, 3);
    let bass = 0.2 + 0.24 * Math.pow(1 - beatPhase, 4);

    if (this.analyser && this.ctx?.state === 'running' && !paused) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      let bassSum = 0;
      for (let i = 0; i < this.freqData.length; i++) {
        sum += this.freqData[i];
        if (i < 8) bassSum += this.freqData[i];
      }
      const liveEnergy = sum / (this.freqData.length * 255);
      const liveBass = bassSum / (8 * 255);
      if (liveEnergy > 0.01) {
        energy = liveEnergy;
        bass = liveBass;
      }
    }

    return {
      songTimeSec: rawTime,
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

  public playCatchSE(combo: number, isMatch = false, isRare = false): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(KITCHEN_SCALE.length - 1, combo % KITCHEN_SCALE.length);
    const baseFreq = KITCHEN_SCALE[idx] * (isRare ? 1.25 : 1.0);

    // Warm boiling-bubble + wooden marimba chime
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 0.92, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.035);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(isMatch || isRare ? 0.3 : 0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + (isMatch ? 0.44 : 0.26));
    osc.connect(gain);
    gain.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.48);

    if (isMatch || isRare) {
      const spark = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      spark.type = 'triangle';
      spark.frequency.setValueAtTime(baseFreq * 1.5, now + 0.045);
      sg.gain.setValueAtTime(0.001, now + 0.045);
      sg.gain.exponentialRampToValueAtTime(0.18, now + 0.06);
      sg.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);
      spark.connect(sg);
      sg.connect(this.masterSeGain);
      spark.start(now + 0.045);
      spark.stop(now + 0.48);
    }
  }

  public playStirSE(onBeat: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    // Wooden ladle swirl + warm kettle steam puff
    const notes = onBeat ? [523.25, 659.25, 783.99, 1046.5] : [440, 587.33, 783.99];
    notes.forEach((freq, i) => {
      const t = now + i * 0.032;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, t + 0.14);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(onBeat ? 0.18 : 0.13, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playSootPurifySE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [783.99, 1174.66].forEach((f, i) => {
      const t = now + i * 0.045;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playSootHitSE(shielded: boolean): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (shielded) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.exponentialRampToValueAtTime(78, now + 0.22);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    }
    osc.connect(gain);
    gain.connect(this.masterSeGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playDishCompleteSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    // Nostalgic warm music-box / dining bell arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, i) => {
      const t = now + i * 0.06;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.72);
      osc.connect(gain);
      gain.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  public playFeverStartSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    // Warm hearth chord + ascending shimmer
    const chord = [392.0, 493.88, 587.33, 783.99];
    chord.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(gain);
      gain.connect(this.masterSeGain!);
      osc.start(now);
      osc.stop(now + 0.95);
    });
    const shimmer = [1046.5, 1318.51, 1567.98, 2093.0];
    shimmer.forEach((f, i) => {
      const t = now + 0.1 + i * 0.065;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.56);
    });
  }

  public playUpgradeSE(): void {
    if (!this.ctx || !this.masterSeGain) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99, 1046.5].forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g);
      g.connect(this.masterSeGain!);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }
}
