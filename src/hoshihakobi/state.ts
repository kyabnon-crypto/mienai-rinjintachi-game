import {
  getHoshihakobiUpgradeCost,
  HOSHIHAKOBI_STORIES,
  HOSHIHAKOBI_TRACKS,
  HOSHIHAKOBI_UPGRADES,
  STAR_CRATE_CAPACITY,
} from './config';
import { HoshihakobiSaveState, HoshihakobiTrackId, HoshihakobiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_hoshihakobi_v1';

function createDefaultState(): HoshihakobiSaveState {
  return {
    stardust: 0,
    totalStardustEarned: 0,
    miracles: 0,
    totalMiraclesSent: 0,
    totalShootingStars: 0,
    totalOrdersCompleted: 0,
    totalCratesReleased: 0,
    bestCombo: 0,
    bestScore: 0,
    crateFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      starWorkbench: 0,
      skylightLantern: 0,
      starCrateBackpack: 0,
      constellationMap: 0,
      fluffyBed: 0,
      starLogDesk: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class HoshihakobiStateManager {
  public state: HoshihakobiSaveState;
  public offlineEarnedStardust = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): HoshihakobiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<HoshihakobiSaveState>;
      const validTracks: HoshihakobiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as HoshihakobiTrackId)
        ? (parsed.selectedTrack as HoshihakobiTrackId)
        : 'dreamy';

      const merged: HoshihakobiSaveState = {
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

      const bedLv = merged.upgrades.fluffyBed;
      if (bedLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * bedLv * 24);
          if (earned > 0) {
            merged.stardust += earned;
            merged.totalStardustEarned += earned;
            this.offlineEarnedStardust = earned;
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
    this.offlineEarnedStardust = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getCrateCapacity(): number {
    return STAR_CRATE_CAPACITY;
  }

  /** Radius around Hoshihakobi to gather wish stars & align constellations */
  public getReachRadius(): number {
    return 1.44 + this.state.upgrades.starWorkbench * 0.16;
  }

  /** How fast Hoshihakobi aligns stars at a night-sky spot (pct/sec) */
  public getAlignRate(): number {
    return 48 + this.state.upgrades.starWorkbench * 7.5;
  }

  /** Radius of STAR SHIFT ("星の並べ替え") wand starlight wave */
  public getStarShiftRadius(): number {
    return 4.4 + this.state.upgrades.constellationMap * 0.48;
  }

  public getStarShiftCooldownSec(): number {
    return Math.max(1.6, 3.3 - this.state.upgrades.constellationMap * 0.24);
  }

  public getStarShiftDurationSec(): number {
    return 2.4 + this.state.upgrades.constellationMap * 0.18;
  }

  public getStardustMultiplier(): number {
    const benchBonus = 1 + this.state.upgrades.starWorkbench * 0.18;
    const crateBonus = 1 + this.state.upgrades.starCrateBackpack * 0.16;
    const deskBonus = 1 + this.state.upgrades.starLogDesk * 0.22;
    return benchBonus * crateBonus * deskBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.skylightLantern * 2;
  }

  public getMiraclesPerCrateRelease(): number {
    return 1 + this.state.upgrades.starCrateBackpack;
  }

  public getShieldCount(): number {
    return this.state.upgrades.fluffyBed;
  }

  public isTrackUnlocked(trackId: HoshihakobiTrackId): boolean {
    return this.state.upgrades.skylightLantern >= HOSHIHAKOBI_TRACKS[trackId].unlockSkylightLevel;
  }

  public canAffordUpgrade(id: HoshihakobiUpgradeId): boolean {
    const def = HOSHIHAKOBI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getHoshihakobiUpgradeCost(def, lv);
    return this.state.stardust >= cost.stardust && this.state.miracles >= cost.miracles;
  }

  public buyUpgrade(id: HoshihakobiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = HOSHIHAKOBI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getHoshihakobiUpgradeCost(def, lv);
    this.state.stardust -= cost.stardust;
    this.state.miracles -= cost.miracles;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return HOSHIHAKOBI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return HOSHIHAKOBI_STORIES.filter(
      (ep) =>
        this.state.upgrades.starLogDesk >= ep.requiredDeskLevel ||
        this.state.totalMiraclesSent >= ep.requiredMiraclesSent
    ).length;
  }
}
