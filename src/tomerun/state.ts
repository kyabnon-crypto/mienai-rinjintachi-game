import {
  getTomerunUpgradeCost,
  JAR_SHELF_CAPACITY,
  TOMERUN_STORIES,
  TOMERUN_TRACKS,
  TOMERUN_UPGRADES,
} from './config';
import { TomerunSaveState, TomerunTrackId, TomerunUpgradeId } from './types';

const STORAGE_KEY = 'mienai_tomerun_v1';

function createDefaultState(): TomerunSaveState {
  return {
    sands: 0,
    totalSandsEarned: 0,
    jars: 0,
    totalMomentsSaved: 0,
    totalSecondsExtended: 0,
    totalOrdersCompleted: 0,
    totalShelfBottled: 0,
    bestCombo: 0,
    bestScore: 0,
    jarFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      hourglassValve: 0,
      timeLantern: 0,
      diningJars: 0,
      expiryTags: 0,
      blueBlanket: 0,
      diaryDesk: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class TomerunStateManager {
  public state: TomerunSaveState;
  public offlineEarnedSands = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): TomerunSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<TomerunSaveState>;
      const validTracks: TomerunTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as TomerunTrackId)
        ? (parsed.selectedTrack as TomerunTrackId)
        : 'dreamy';

      const merged: TomerunSaveState = {
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

      const blanketLv = merged.upgrades.blueBlanket;
      if (blanketLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * blanketLv * 24);
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

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getJarCapacity(): number {
    return JAR_SHELF_CAPACITY;
  }

  /** Radius around Tomerun to gather moment tokens & extend time at spots */
  public getReachRadius(): number {
    return 1.42 + this.state.upgrades.hourglassValve * 0.16;
  }

  /** How fast Tomerun extends & preserves a spot's time (pct/sec) */
  public getPreserveRate(): number {
    return 47 + this.state.upgrades.hourglassValve * 7.5;
  }

  /** Radius of VALVE PAUSE ("バルブ回し") golden-frost wave */
  public getValvePauseRadius(): number {
    return 4.35 + this.state.upgrades.expiryTags * 0.48;
  }

  public getValvePauseCooldownSec(): number {
    return Math.max(1.6, 3.3 - this.state.upgrades.expiryTags * 0.24);
  }

  public getValvePauseDurationSec(): number {
    return 2.4 + this.state.upgrades.expiryTags * 0.18;
  }

  public getSandsMultiplier(): number {
    const valveBonus = 1 + this.state.upgrades.hourglassValve * 0.18;
    const diningBonus = 1 + this.state.upgrades.diningJars * 0.16;
    const deskBonus = 1 + this.state.upgrades.diaryDesk * 0.22;
    return valveBonus * diningBonus * deskBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.timeLantern * 2;
  }

  public getJarsPerBottling(): number {
    return 1 + this.state.upgrades.diningJars;
  }

  public getShieldCount(): number {
    return this.state.upgrades.blueBlanket;
  }

  public isTrackUnlocked(trackId: TomerunTrackId): boolean {
    return this.state.upgrades.timeLantern >= TOMERUN_TRACKS[trackId].unlockLanternLevel;
  }

  public canAffordUpgrade(id: TomerunUpgradeId): boolean {
    const def = TOMERUN_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getTomerunUpgradeCost(def, lv);
    return this.state.sands >= cost.sands && this.state.jars >= cost.jars;
  }

  public buyUpgrade(id: TomerunUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = TOMERUN_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getTomerunUpgradeCost(def, lv);
    this.state.sands -= cost.sands;
    this.state.jars -= cost.jars;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return TOMERUN_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return TOMERUN_STORIES.filter(
      (ep) =>
        this.state.upgrades.diaryDesk >= ep.requiredDeskLevel ||
        this.state.totalMomentsSaved >= ep.requiredMomentsSaved
    ).length;
  }
}
