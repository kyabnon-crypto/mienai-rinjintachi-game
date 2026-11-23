import {
  ASHITAYOBI_STORIES,
  ASHITAYOBI_TRACKS,
  ASHITAYOBI_UPGRADES,
  getAshitayobiUpgradeCost,
  SATCHEL_CAPACITY,
} from './config';
import { AshitayobiSaveState, AshitayobiTrackId, AshitayobiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_ashitayobi_v1';

function createDefaultState(): AshitayobiSaveState {
  return {
    glow: 0,
    totalGlowEarned: 0,
    bottles: 0,
    totalMorningsDelivered: 0,
    totalWindowsLit: 0,
    totalOrdersCompleted: 0,
    totalSatchelsDispatched: 0,
    bestCombo: 0,
    bestScore: 0,
    satchelFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      sortingBench: 0,
      dawnDrawers: 0,
      mixingDesk: 0,
      dawnSatchel: 0,
      sunriseArch: 0,
      loadingLedger: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class AshitayobiStateManager {
  public state: AshitayobiSaveState;
  public offlineEarnedGlow = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): AshitayobiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<AshitayobiSaveState>;
      const validTracks: AshitayobiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as AshitayobiTrackId)
        ? (parsed.selectedTrack as AshitayobiTrackId)
        : 'dreamy';

      const merged: AshitayobiSaveState = {
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

      const mixLv = merged.upgrades.mixingDesk;
      if (mixLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * mixLv * 24);
          if (earned > 0) {
            merged.glow += earned;
            merged.totalGlowEarned += earned;
            this.offlineEarnedGlow = earned;
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
    this.offlineEarnedGlow = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getSatchelCapacity(): number {
    return SATCHEL_CAPACITY;
  }

  /** Radius around Ashitayobi to gather dawn lights & warm window spots */
  public getReachRadius(): number {
    return 1.44 + this.state.upgrades.sortingBench * 0.16;
  }

  /** How fast Ashitayobi delivers dawn light to a sleeping window spot (pct/sec) */
  public getDeliverRate(): number {
    return 48 + this.state.upgrades.sortingBench * 7.5;
  }

  /** Radius of "特別な朝焼け (DAWN DELIVERY)" sunrise wave */
  public getDawnWaveRadius(): number {
    return 4.4 + this.state.upgrades.dawnDrawers * 0.48;
  }

  public getDawnWaveCooldownSec(): number {
    return Math.max(1.6, 3.3 - this.state.upgrades.dawnDrawers * 0.24);
  }

  public getDawnWaveDurationSec(): number {
    return 2.4 + this.state.upgrades.dawnDrawers * 0.18;
  }

  public getGlowMultiplier(): number {
    const benchBonus = 1 + this.state.upgrades.sortingBench * 0.18;
    const satchelBonus = 1 + this.state.upgrades.dawnSatchel * 0.16;
    const ledgerBonus = 1 + this.state.upgrades.loadingLedger * 0.22;
    return benchBonus * satchelBonus * ledgerBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.sunriseArch * 2;
  }

  public getBottlesPerSatchelDispatch(): number {
    return 1 + this.state.upgrades.dawnSatchel;
  }

  public getShieldCount(): number {
    return this.state.upgrades.mixingDesk;
  }

  public isTrackUnlocked(trackId: AshitayobiTrackId): boolean {
    return this.state.upgrades.sunriseArch >= ASHITAYOBI_TRACKS[trackId].unlockArchLevel;
  }

  public canAffordUpgrade(id: AshitayobiUpgradeId): boolean {
    const def = ASHITAYOBI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getAshitayobiUpgradeCost(def, lv);
    return this.state.glow >= cost.glow && this.state.bottles >= cost.bottles;
  }

  public buyUpgrade(id: AshitayobiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = ASHITAYOBI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getAshitayobiUpgradeCost(def, lv);
    this.state.glow -= cost.glow;
    this.state.bottles -= cost.bottles;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return ASHITAYOBI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return ASHITAYOBI_STORIES.filter(
      (ep) =>
        this.state.upgrades.loadingLedger >= ep.requiredLedgerLevel ||
        this.state.totalMorningsDelivered >= ep.requiredMorningsDelivered
    ).length;
  }
}
