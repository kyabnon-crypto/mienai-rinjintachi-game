import {
  getTsumazukiUpgradeCost,
  RETURN_BASKET_CAPACITY,
  TSUMAZUKI_STORIES,
  TSUMAZUKI_TRACKS,
  TSUMAZUKI_UPGRADES,
} from './config';
import { TsumazukiSaveState, TsumazukiTrackId, TsumazukiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_tsumazuki_v1';

function createDefaultState(): TsumazukiSaveState {
  return {
    drops: 0,
    totalDropsEarned: 0,
    charms: 0,
    totalSaves: 0,
    totalOrdersCompleted: 0,
    totalBasketReturns: 0,
    bestCombo: 0,
    bestScore: 0,
    basketFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      hourglasses: 0,
      archWindow: 0,
      lostShelf: 0,
      pendulumClock: 0,
      tealCloak: 0,
      watchJournal: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class TsumazukiStateManager {
  public state: TsumazukiSaveState;
  public offlineEarnedDrops = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): TsumazukiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<TsumazukiSaveState>;
      const validTracks: TsumazukiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as TsumazukiTrackId)
        ? (parsed.selectedTrack as TsumazukiTrackId)
        : 'dreamy';

      const merged: TsumazukiSaveState = {
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

      const cloakLv = merged.upgrades.tealCloak;
      if (cloakLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * cloakLv * 24);
          if (earned > 0) {
            merged.drops += earned;
            merged.totalDropsEarned += earned;
            this.offlineEarnedDrops = earned;
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
    this.offlineEarnedDrops = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getBasketCapacity(): number {
    return RETURN_BASKET_CAPACITY;
  }

  /** Radius around Tsumazuki where time gently slows to catch dropped items & steady residents */
  public getReachRadius(): number {
    return 1.38 + this.state.upgrades.hourglasses * 0.16;
  }

  /** How fast Tsumazuki steadies a stumbling resident (pct/sec) */
  public getSteadyRate(): number {
    return 47 + this.state.upgrades.hourglasses * 7.5;
  }

  /** Radius of TIME SLOW ("ほんのひと秒") ripple */
  public getTimeSlowRadius(): number {
    return 4.1 + this.state.upgrades.pendulumClock * 0.48;
  }

  public getTimeSlowCooldownSec(): number {
    return Math.max(1.5, 3.1 - this.state.upgrades.pendulumClock * 0.22);
  }

  public getDropsMultiplier(): number {
    const hgBonus = 1 + this.state.upgrades.hourglasses * 0.18;
    const shelfBonus = 1 + this.state.upgrades.lostShelf * 0.16;
    const journalBonus = 1 + this.state.upgrades.watchJournal * 0.22;
    return hgBonus * shelfBonus * journalBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.archWindow * 2;
  }

  public getCharmsPerReturn(): number {
    return 1 + this.state.upgrades.lostShelf;
  }

  public getShieldCount(): number {
    return this.state.upgrades.tealCloak;
  }

  public isTrackUnlocked(trackId: TsumazukiTrackId): boolean {
    return this.state.upgrades.archWindow >= TSUMAZUKI_TRACKS[trackId].unlockWindowLevel;
  }

  public canAffordUpgrade(id: TsumazukiUpgradeId): boolean {
    const def = TSUMAZUKI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getTsumazukiUpgradeCost(def, lv);
    return this.state.drops >= cost.drops && this.state.charms >= cost.charms;
  }

  public buyUpgrade(id: TsumazukiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = TSUMAZUKI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getTsumazukiUpgradeCost(def, lv);
    this.state.drops -= cost.drops;
    this.state.charms -= cost.charms;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return TSUMAZUKI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return TSUMAZUKI_STORIES.filter(
      (ep) =>
        this.state.upgrades.watchJournal >= ep.requiredJournalLevel ||
        this.state.totalSaves >= ep.requiredSaves
    ).length;
  }
}
