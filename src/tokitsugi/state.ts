import {
  getTokitsugiUpgradeCost,
  TOKITSUGI_STORIES,
  TOKITSUGI_TRACKS,
  TOKITSUGI_UPGRADES,
  WATCH_CAPACITY,
} from './config';
import { TokitsugiSaveState, TokitsugiTrackId, TokitsugiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_tokitsugi_v1';

function createDefaultState(): TokitsugiSaveState {
  return {
    sands: 0,
    totalSandsEarned: 0,
    miracles: 0,
    totalWatchesMended: 0,
    totalOrdersCompleted: 0,
    bestCombo: 0,
    bestScore: 0,
    watchFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      repairKit: 0,
      grandClock: 0,
      goldenThread: 0,
      memoryJars: 0,
      hourglass: 0,
      closetDiary: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class TokitsugiStateManager {
  public state: TokitsugiSaveState;
  public offlineEarnedSands = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): TokitsugiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<TokitsugiSaveState>;
      const validTracks: TokitsugiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as TokitsugiTrackId)
        ? (parsed.selectedTrack as TokitsugiTrackId)
        : 'dreamy';

      const merged: TokitsugiSaveState = {
        ...fallback,
        ...parsed,
        selectedTrack,
        upgrades: {
          ...fallback.upgrades,
          ...(parsed.upgrades || {}),
        },
        settings: {
          ...fallback.settings,
          ...(parsed.settings || {}),
        },
      };

      const jarLv = merged.upgrades.memoryJars;
      if (jarLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * jarLv * 22);
          if (earned > 0) {
            merged.sands += earned;
            merged.totalSandsEarned += earned;
            this.offlineEarnedSands = earned;
          }
        }
      }
      return merged;
    } catch {
      return fallback;
    }
  }

  public save(): void {
    this.state.lastSavedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage quota errors
    }
  }

  public reset(): void {
    this.state = createDefaultState();
    this.offlineEarnedSands = 0;
    this.save();
  }

  public getWorkshopRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getWatchCapacity(): number {
    return WATCH_CAPACITY;
  }

  /** Angular tolerance in radians for PERFECT hand-alignment stitch */
  public getPerfectAngleRad(): number {
    const deg = 14 + this.state.upgrades.repairKit * 1.8;
    return (deg * Math.PI) / 180;
  }

  /** Angular tolerance in radians for GOOD hand-alignment stitch */
  public getGoodAngleRad(): number {
    const deg = 30 + this.state.upgrades.repairKit * 3.5;
    return (deg * Math.PI) / 180;
  }

  public getRewindCooldownSec(): number {
    return Math.max(1.4, 2.8 - this.state.upgrades.goldenThread * 0.16);
  }

  public getSandMultiplier(): number {
    const kitBonus = 1 + this.state.upgrades.repairKit * 0.18;
    const threadBonus = 1 + this.state.upgrades.goldenThread * 0.15;
    const diaryBonus = 1 + this.state.upgrades.closetDiary * 0.22;
    return kitBonus * threadBonus * diaryBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.grandClock * 2;
  }

  public getMiraclesPerWatch(): number {
    return 1 + this.state.upgrades.goldenThread;
  }

  public getShieldCount(): number {
    return this.state.upgrades.hourglass;
  }

  public isTrackUnlocked(trackId: TokitsugiTrackId): boolean {
    return this.state.upgrades.grandClock >= TOKITSUGI_TRACKS[trackId].unlockClockLevel;
  }

  public canAffordUpgrade(id: TokitsugiUpgradeId): boolean {
    const def = TOKITSUGI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getTokitsugiUpgradeCost(def, lv);
    return this.state.sands >= cost.sands && this.state.miracles >= cost.miracles;
  }

  public buyUpgrade(id: TokitsugiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = TOKITSUGI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getTokitsugiUpgradeCost(def, lv);
    this.state.sands -= cost.sands;
    this.state.miracles -= cost.miracles;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return TOKITSUGI_UPGRADES.some((u) => this.canAffordUpgrade(u.id));
  }

  public getUnlockedStoriesCount(): number {
    return TOKITSUGI_STORIES.filter(
      (ep) =>
        this.state.upgrades.closetDiary >= ep.requiredDiaryLevel ||
        this.state.totalWatchesMended >= ep.requiredWatchesMended
    ).length;
  }
}
